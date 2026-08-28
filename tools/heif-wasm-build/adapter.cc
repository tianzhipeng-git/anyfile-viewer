#include <algorithm>
#include <cstdint>
#include <new>
#include <stdexcept>
#include <string>
#include <vector>

#include <emscripten/bind.h>
#include <libheif/heif.h>

namespace {
constexpr uint64_t kMaxPixels = 64ULL * 1024 * 1024;
constexpr uint64_t kMaxTotalMemory = 384ULL * 1024 * 1024;

struct ContextGuard {
  heif_context* value = heif_context_alloc();
  ~ContextGuard() { if (value) heif_context_free(value); }
};

struct HandleGuard {
  heif_image_handle* value = nullptr;
  ~HandleGuard() { if (value) heif_image_handle_release(value); }
};

struct ImageGuard {
  heif_image* value = nullptr;
  ~ImageGuard() { if (value) heif_image_release(value); }
};

struct OptionsGuard {
  heif_decoding_options* value = heif_decoding_options_alloc();
  ~OptionsGuard() { if (value) heif_decoding_options_free(value); }
};

[[noreturn]] void fail(const char* category, const std::string& message) {
  throw std::runtime_error(std::string(category) + ": " + message);
}

void check(heif_error error) {
  if (error.code == heif_error_Ok) return;
  const bool limited = error.code == heif_error_Memory_allocation_error ||
                       error.subcode == heif_suberror_Security_limit_exceeded;
  fail(limited ? "resource-limit" : "invalid-file",
       error.message ? error.message : "HEIF decoder error");
}

emscripten::val decode_primary_impl(const emscripten::val& input) {
  const size_t input_size = input["byteLength"].as<size_t>();
  if (input_size == 0) fail("invalid-file", "empty HEIF file");
  std::vector<uint8_t> encoded(input_size);
  emscripten::val(emscripten::typed_memory_view(encoded.size(), encoded.data())).call<void>("set", input);

  ContextGuard context;
  if (!context.value) fail("resource-limit", "cannot allocate HEIF context");
  auto* limits = heif_context_get_security_limits(context.value);
  limits->max_image_size_pixels = kMaxPixels;
  limits->max_number_of_tiles = 4096;
  limits->max_items = 256;
  limits->max_color_profile_size = 16 * 1024 * 1024;
  limits->max_memory_block_size = 256ULL * 1024 * 1024;
  limits->max_components = 8;
  limits->max_iloc_extents_per_item = 1024;
  limits->max_size_entity_group = 256;
  limits->max_children_per_box = 4096;
  limits->max_total_memory = kMaxTotalMemory;
  limits->max_sample_description_box_entries = 256;
  limits->max_sample_group_description_box_entries = 256;
  limits->max_sequence_frames = 1;
  limits->max_number_of_file_brands = 64;
  check(heif_context_read_from_memory_without_copy(context.value, encoded.data(), encoded.size(), nullptr));
  if (heif_context_get_number_of_top_level_images(context.value) > 64) {
    fail("resource-limit", "too many top-level images");
  }

  HandleGuard handle;
  check(heif_context_get_primary_image_handle(context.value, &handle.value));
  const int bit_depth = heif_image_handle_get_luma_bits_per_pixel(handle.value);
  const heif_color_profile_type input_profile = heif_image_handle_get_color_profile_type(handle.value);

  OptionsGuard options;
  if (!options.value) fail("resource-limit", "cannot allocate HEIF decoding options");
  options.value->ignore_transformations = 0;
  options.value->convert_hdr_to_8bit = 1;
  options.value->strict_decoding = 1;
  options.value->num_library_threads = 1;
  options.value->num_codec_threads = 1;

  ImageGuard image;
  check(heif_decode_image(handle.value, &image.value, heif_colorspace_RGB,
                          heif_chroma_interleaved_RGBA, options.value));
  const int width = heif_image_get_width(image.value, heif_channel_interleaved);
  const int height = heif_image_get_height(image.value, heif_channel_interleaved);
  if (width <= 0 || height <= 0 || static_cast<uint64_t>(width) * height > kMaxPixels) {
    fail("resource-limit", "decoded image dimensions exceed the pixel limit");
  }
  size_t stride = 0;
  uint8_t* plane = heif_image_get_plane2(image.value, heif_channel_interleaved, &stride);
  const size_t row_bytes = static_cast<size_t>(width) * 4;
  if (!plane || stride < row_bytes) fail("invalid-file", "invalid decoded RGBA plane");
  if (heif_image_is_premultiplied_alpha(image.value)) {
    for (int y = 0; y < height; ++y) {
      uint8_t* row = plane + static_cast<size_t>(y) * stride;
      for (size_t offset = 0; offset < row_bytes; offset += 4) {
        const unsigned alpha = row[offset + 3];
        if (alpha == 0 || alpha == 255) continue;
        for (size_t channel = 0; channel < 3; ++channel) {
          row[offset + channel] = static_cast<uint8_t>(std::min(255U, (row[offset + channel] * 255U + alpha / 2) / alpha));
        }
      }
    }
  }

  emscripten::val output = emscripten::val::object();
  output.set("width", width);
  output.set("height", height);
  output.set("alpha", heif_image_handle_has_alpha_channel(handle.value) != 0);
  const bool has_icc = input_profile == heif_color_profile_type_prof || input_profile == heif_color_profile_type_rICC;
  output.set("color", has_icc ? "unknown" : "sRGB");
  output.set("iccApplied", false);
  output.set("hdrToSdr", bit_depth > 8);
  const size_t output_size = row_bytes * static_cast<size_t>(height);
  emscripten::val pixels = emscripten::val::global("Uint8Array").new_(output_size);
  for (int y = 0; y < height; ++y) {
    pixels.call<void>("set", emscripten::val(emscripten::typed_memory_view(
      row_bytes, plane + static_cast<size_t>(y) * stride)), static_cast<size_t>(y) * row_bytes);
  }
  output.set("rgba", pixels["buffer"]);
  return output;
}

emscripten::val decode_primary(const emscripten::val& input) {
  try {
    return decode_primary_impl(input);
  } catch (const std::bad_alloc&) {
    fail("resource-limit", "decoder memory exhausted");
  } catch (const std::length_error&) {
    fail("resource-limit", "decoder allocation exceeds the memory limit");
  }
}
}

EMSCRIPTEN_BINDINGS(anyfile_heif_decoder) {
  emscripten::function("decodePrimary", &decode_primary);
}

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <unordered_map>

#include "ddjvuapi.h"
#include "miniexp.h"

namespace {

constexpr int kMaxOutlineItems = 10000;
constexpr int kMaxOutlineDepth = 32;
constexpr int kMaxTextWords = 20000;
constexpr size_t kMaxTextJsonBytes = 1024 * 1024;
constexpr uint64_t kMaxRenderPixels = 16000000ULL;

struct DjVuDocState {
  ddjvu_context_t *ctx = nullptr;
  ddjvu_document_t *doc = nullptr;
  ddjvu_format_t *rgba_fmt = nullptr;
  std::string last_error;
  std::string scratch_json;
};

void drain_messages(DjVuDocState *state) {
  if (!state || !state->ctx) return;
  const ddjvu_message_t *msg = nullptr;
  while ((msg = ddjvu_message_peek(state->ctx)) != nullptr) {
    if (msg->m_any.tag == DDJVU_ERROR && msg->m_error.message) {
      if (state->last_error.empty()) {
        state->last_error = msg->m_error.message;
      }
    }
    ddjvu_message_pop(state->ctx);
  }
}

void append_json_string(std::string &out, const char *s) {
  out.push_back('"');
  if (s) {
    for (const unsigned char *p = reinterpret_cast<const unsigned char *>(s); *p; ++p) {
      unsigned char ch = *p;
      if (ch == '"') out.append("\\\"");
      else if (ch == '\\') out.append("\\\\");
      else if (ch == '\b') out.append("\\b");
      else if (ch == '\f') out.append("\\f");
      else if (ch == '\n') out.append("\\n");
      else if (ch == '\r') out.append("\\r");
      else if (ch == '\t') out.append("\\t");
      else if (ch < 0x20) {
        char buf[8];
        std::snprintf(buf, sizeof(buf), "\\u%04x", static_cast<unsigned int>(ch));
        out.append(buf);
      } else {
        out.push_back(static_cast<char>(ch));
      }
    }
  }
  out.push_back('"');
}

int resolve_outline_page(const char *url, const std::unordered_map<std::string, int> &id_to_page, int page_count) {
  if (!url || !*url) return -1;
  const char *target = url;
  if (target[0] == '#') target += 1;
  if (!*target) return -1;

  auto it = id_to_page.find(target);
  if (it != id_to_page.end()) return it->second;

  char *end = nullptr;
  long one_based = std::strtol(target, &end, 10);
  if (end && *end == '\0' && one_based >= 1 && one_based <= page_count) {
    return static_cast<int>(one_based - 1);
  }
  return -1;
}

void write_outline_items(
  miniexp_t list,
  const std::unordered_map<std::string, int> &id_to_page,
  int page_count,
  int depth,
  int &count,
  std::string &out
) {
  out.push_back('[');
  bool first = true;
  for (miniexp_t cur = list; miniexp_consp(cur) && count < kMaxOutlineItems; cur = miniexp_cdr(cur)) {
    miniexp_t item = miniexp_car(cur);
    if (!miniexp_consp(item)) continue;
    miniexp_t title_exp = miniexp_car(item);
    miniexp_t rest = miniexp_cdr(item);
    miniexp_t url_exp = miniexp_consp(rest) ? miniexp_car(rest) : miniexp_nil;
    miniexp_t children = miniexp_consp(rest) ? miniexp_cdr(rest) : miniexp_nil;

    const char *title = miniexp_stringp(title_exp) ? miniexp_to_str(title_exp) : "";
    const char *url = miniexp_stringp(url_exp) ? miniexp_to_str(url_exp) : "";
    int page = resolve_outline_page(url, id_to_page, page_count);

    if (!first) out.push_back(',');
    first = false;
    count += 1;

    out.append("{\"title\":");
    append_json_string(out, title);
    out.append(",\"page\":");
    out.append(std::to_string(page));
    out.append(",\"children\":");
    if (depth < kMaxOutlineDepth && miniexp_consp(children)) {
      write_outline_items(children, id_to_page, page_count, depth + 1, count, out);
    } else {
      out.append("[]");
    }
    out.push_back('}');
  }
  out.push_back(']');
}

void collect_text_words(
  miniexp_t node,
  ddjvu_rectmapper_t *mapper,
  int &word_count,
  std::string &out,
  bool &first
) {
  if (!miniexp_consp(node) || word_count >= kMaxTextWords || out.size() >= kMaxTextJsonBytes) return;
  miniexp_t type_exp = miniexp_car(node);
  if (!miniexp_symbolp(type_exp)) return;
  miniexp_t r1 = miniexp_cdr(node);
  miniexp_t r2 = miniexp_cdr(r1);
  miniexp_t r3 = miniexp_cdr(r2);
  miniexp_t r4 = miniexp_cdr(r3);
  miniexp_t body = miniexp_cdr(r4);
  if (!miniexp_consp(r1) || !miniexp_consp(r2) || !miniexp_consp(r3) || !miniexp_consp(r4) || !miniexp_consp(body)) {
    return;
  }

  miniexp_t xmin_exp = miniexp_car(r1);
  miniexp_t ymin_exp = miniexp_car(r2);
  miniexp_t xmax_exp = miniexp_car(r3);
  miniexp_t ymax_exp = miniexp_car(r4);
  miniexp_t first_child = miniexp_car(body);

  if (miniexp_stringp(first_child) && miniexp_numberp(xmin_exp) && miniexp_numberp(ymin_exp) && miniexp_numberp(xmax_exp) && miniexp_numberp(ymax_exp)) {
    const char *text = miniexp_to_str(first_child);
    int xmin = miniexp_to_int(xmin_exp);
    int ymin = miniexp_to_int(ymin_exp);
    int xmax = miniexp_to_int(xmax_exp);
    int ymax = miniexp_to_int(ymax_exp);
    if (text && *text && xmax > xmin && ymax > ymin) {
      ddjvu_rect_t rect{xmin, ymin, static_cast<unsigned int>(xmax - xmin), static_cast<unsigned int>(ymax - ymin)};
      ddjvu_map_rect(mapper, &rect);
      if (rect.w > 0 && rect.h > 0) {
        if (!first) out.push_back(',');
        first = false;
        word_count += 1;
        out.append("{\"x\":");
        out.append(std::to_string(rect.x));
        out.append(",\"y\":");
        out.append(std::to_string(rect.y));
        out.append(",\"w\":");
        out.append(std::to_string(rect.w));
        out.append(",\"h\":");
        out.append(std::to_string(rect.h));
        out.append(",\"t\":");
        append_json_string(out, text);
        out.push_back('}');
      }
    }
    return;
  }

  for (miniexp_t cur = body; miniexp_consp(cur) && word_count < kMaxTextWords && out.size() < kMaxTextJsonBytes; cur = miniexp_cdr(cur)) {
    collect_text_words(miniexp_car(cur), mapper, word_count, out, first);
  }
}

}  // namespace

extern "C" {

DjVuDocState *djvu_open(const char *path) {
  auto *state = new DjVuDocState();
  state->ctx = ddjvu_context_create("anyfile-djvu");
  if (!state->ctx) {
    state->last_error = "Unable to create DjVu context";
    return state;
  }
  ddjvu_cache_set_size(state->ctx, 16 * 1024 * 1024);

  state->doc = ddjvu_document_create_by_filename_utf8(state->ctx, path, TRUE);
  drain_messages(state);

  if (!state->doc || ddjvu_document_decoding_error(state->doc) || !ddjvu_document_decoding_done(state->doc) ||
      ddjvu_document_get_type(state->doc) == DDJVU_DOCTYPE_UNKNOWN) {
    if (state->last_error.empty()) {
      state->last_error = "Invalid or unsupported DjVu document";
    }
    if (state->doc) {
      ddjvu_document_release(state->doc);
      state->doc = nullptr;
    }
    return state;
  }

  unsigned int masks[4] = {0x000000ffu, 0x0000ff00u, 0x00ff0000u, 0xff000000u};
  state->rgba_fmt = ddjvu_format_create(DDJVU_FORMAT_RGBMASK32, 4, masks);
  if (!state->rgba_fmt) {
    state->last_error = "Unable to allocate DjVu pixel format";
    ddjvu_document_release(state->doc);
    state->doc = nullptr;
    return state;
  }
  ddjvu_format_set_row_order(state->rgba_fmt, 1);
  ddjvu_format_set_y_direction(state->rgba_fmt, 1);
  return state;
}

int djvu_is_open(DjVuDocState *state) {
  return state && state->doc && state->rgba_fmt ? 1 : 0;
}

const char *djvu_last_error(DjVuDocState *state) {
  return state ? state->last_error.c_str() : "Unknown DjVu error";
}

int djvu_doc_type(DjVuDocState *state) {
  if (!djvu_is_open(state)) return 0;
  return static_cast<int>(ddjvu_document_get_type(state->doc));
}

int djvu_page_count(DjVuDocState *state) {
  if (!djvu_is_open(state)) return 0;
  return ddjvu_document_get_pagenum(state->doc);
}

int djvu_page_info(DjVuDocState *state, int pageno, int *out_4ints) {
  if (!djvu_is_open(state) || !out_4ints) return 0;
  ddjvu_pageinfo_t info;
  std::memset(&info, 0, sizeof(info));
  ddjvu_status_t st = ddjvu_document_get_pageinfo(state->doc, pageno, &info);
  drain_messages(state);
  if (st != DDJVU_JOB_OK || info.width <= 0 || info.height <= 0) {
    return 0;
  }
  out_4ints[0] = info.width;
  out_4ints[1] = info.height;
  out_4ints[2] = info.dpi;
  out_4ints[3] = info.rotation;
  return 1;
}

const char *djvu_outline_json(DjVuDocState *state) {
  if (!djvu_is_open(state)) return "[]";
  state->scratch_json.clear();

  miniexp_t outline = ddjvu_document_get_outline(state->doc);
  drain_messages(state);
  if (outline == miniexp_nil || outline == miniexp_dummy || !miniexp_consp(outline)) {
    if (outline && outline != miniexp_nil && outline != miniexp_dummy) {
      ddjvu_miniexp_release(state->doc, outline);
    }
    return "[]";
  }

  std::unordered_map<std::string, int> id_to_page;
  int file_count = ddjvu_document_get_filenum(state->doc);
  for (int i = 0; i < file_count; ++i) {
    ddjvu_fileinfo_t fi;
    if (ddjvu_document_get_fileinfo(state->doc, i, &fi) == DDJVU_JOB_OK && fi.pageno >= 0) {
      if (fi.id && *fi.id) id_to_page[fi.id] = fi.pageno;
      if (fi.name && *fi.name) id_to_page[fi.name] = fi.pageno;
    }
  }

  int page_count = ddjvu_document_get_pagenum(state->doc);
  int count = 0;
  miniexp_t entries = outline;
  if (miniexp_symbolp(miniexp_car(outline))) {
    entries = miniexp_cdr(outline);
  }
  write_outline_items(entries, id_to_page, page_count, 0, count, state->scratch_json);
  ddjvu_miniexp_release(state->doc, outline);
  return state->scratch_json.c_str();
}

const char *djvu_page_text_json(DjVuDocState *state, int pageno) {
  if (!djvu_is_open(state)) return "";
  state->scratch_json.clear();

  ddjvu_pageinfo_t info;
  std::memset(&info, 0, sizeof(info));
  if (ddjvu_document_get_pageinfo(state->doc, pageno, &info) != DDJVU_JOB_OK || info.width <= 0 || info.height <= 0) {
    drain_messages(state);
    return "";
  }

  miniexp_t text_exp = ddjvu_document_get_pagetext(state->doc, pageno, "word");
  drain_messages(state);
  if (text_exp == miniexp_nil || text_exp == miniexp_dummy || !miniexp_consp(text_exp)) {
    if (text_exp && text_exp != miniexp_nil && text_exp != miniexp_dummy) {
      ddjvu_miniexp_release(state->doc, text_exp);
    }
    return "";
  }

  int unrotated_w = (info.rotation & 1) ? info.height : info.width;
  int unrotated_h = (info.rotation & 1) ? info.width : info.height;
  ddjvu_rect_t in_rect{0, 0, static_cast<unsigned int>(unrotated_w), static_cast<unsigned int>(unrotated_h)};
  ddjvu_rect_t out_rect{0, 0, 10000u, 10000u};
  ddjvu_rectmapper_t *mapper = ddjvu_rectmapper_create(&in_rect, &out_rect);
  if (!mapper) {
    ddjvu_miniexp_release(state->doc, text_exp);
    return "";
  }
  ddjvu_rectmapper_modify(mapper, info.rotation, 0, 1);

  state->scratch_json.append("{\"scale\":10000,\"words\":[");
  int word_count = 0;
  bool first = true;
  collect_text_words(text_exp, mapper, word_count, state->scratch_json, first);
  state->scratch_json.append("]}");

  ddjvu_rectmapper_release(mapper);
  ddjvu_miniexp_release(state->doc, text_exp);
  if (word_count == 0) {
    state->scratch_json.clear();
    return "";
  }
  return state->scratch_json.c_str();
}

int djvu_render_page(DjVuDocState *state, int pageno, int target_w, int target_h, uint8_t *out_rgba, int mode) {
  if (!djvu_is_open(state) || !out_rgba || target_w <= 0 || target_h <= 0) return 0;
  uint64_t pixels = static_cast<uint64_t>(target_w) * static_cast<uint64_t>(target_h);
  if (pixels == 0 || pixels > kMaxRenderPixels) return 0;

  state->last_error.clear();
  ddjvu_page_t *page = ddjvu_page_create_by_pageno(state->doc, pageno);
  drain_messages(state);
  if (!page || ddjvu_page_decoding_error(page) || !ddjvu_page_decoding_done(page)) {
    if (state->last_error.empty()) state->last_error = "Failed to decode DjVu page";
    if (page) ddjvu_page_release(page);
    return 0;
  }

  std::memset(out_rgba, 0xff, static_cast<size_t>(pixels) * 4);
  ddjvu_rect_t rect{0, 0, static_cast<unsigned int>(target_w), static_cast<unsigned int>(target_h)};
  ddjvu_page_render(
    page,
    static_cast<ddjvu_render_mode_t>(mode),
    &rect,
    &rect,
    state->rgba_fmt,
    static_cast<unsigned long>(target_w) * 4,
    reinterpret_cast<char *>(out_rgba)
  );
  drain_messages(state);
  ddjvu_page_release(page);
  return 1;
}

void djvu_close(DjVuDocState *state) {
  if (!state) return;
  if (state->rgba_fmt) {
    ddjvu_format_release(state->rgba_fmt);
    state->rgba_fmt = nullptr;
  }
  if (state->doc) {
    ddjvu_document_release(state->doc);
    state->doc = nullptr;
  }
  if (state->ctx) {
    ddjvu_context_release(state->ctx);
    state->ctx = nullptr;
  }
  delete state;
}

}  // extern "C"

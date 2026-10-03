#include <emscripten/bind.h>
#include <libvisio/libvisio.h>
#include <librevenge/librevenge.h>
#include <librevenge-stream/librevenge-stream.h>
#include <cstring>
#include <unicode/udata.h>
#include <unicode/ucnv.h>
#include <stdexcept>
#include <string>
#include <vector>

// Per-instance state lives in a dedicated, terminable Worker.
static librevenge::RVNGStringVector pages;
static bool exceeded = false;
static std::vector<uint64_t> icuData;
void setIcuData(const std::string &input) {
  icuData.resize((input.size() + 7) / 8);
  std::memcpy(icuData.data(), input.data(), input.size());
  UErrorCode status = U_ZERO_ERROR;
  udata_setCommonData(icuData.data(), &status);
  if (U_FAILURE(status)) throw std::runtime_error("ICU initialization failed");
  UConverter *converter = ucnv_open("windows-936", &status);
  if (U_FAILURE(status) || !converter) throw std::runtime_error("ICU converter missing");
  ucnv_close(converter);
}
class BoundedGenerator : public librevenge::RVNGSVGDrawingGenerator {
  unsigned count = 0;
  size_t bytes = 0;
public:
  BoundedGenerator() : RVNGSVGDrawingGenerator(pages, "") {}
  void startPage(const librevenge::RVNGPropertyList &props) override {
    if (++count > 512) { exceeded = true; throw std::length_error("resource-limit"); }
    RVNGSVGDrawingGenerator::startPage(props);
  }
  void endPage() override {
    RVNGSVGDrawingGenerator::endPage();
    size_t pageBytes = std::strlen(pages[pages.size() - 1].cstr());
    bytes += pageBytes;
    if (pageBytes > 16 * 1024 * 1024 || bytes > 64 * 1024 * 1024) { exceeded = true; throw std::length_error("resource-limit"); }
  }
};
int openVisio(const std::string &input) {
  exceeded = false;
  pages = librevenge::RVNGStringVector();
  librevenge::RVNGStringStream stream(reinterpret_cast<const unsigned char *>(input.data()), input.size());
  BoundedGenerator generator;
  if (!libvisio::VisioDocument::isSupported(&stream)) return 0;
  stream.seek(0, librevenge::RVNG_SEEK_SET);
  bool parsed = libvisio::VisioDocument::parse(&stream, &generator);
  if (!parsed || exceeded) { pages = librevenge::RVNGStringVector(); return exceeded ? -1 : 0; }
  return pages.size();
}
std::string pageSvg(unsigned index) {
  if (index >= pages.size()) return "";
  return pages[index].cstr();
}
EMSCRIPTEN_BINDINGS(anyfile_visio) {
  emscripten::function("setIcuData", &setIcuData);
  emscripten::function("openVisio", &openVisio);
  emscripten::function("pageSvg", &pageSvg);
}

// Anyfile ReadStat adapter: parses statistical data files through a JavaScript
// byte reader and returns bounded JSON. Revision 1.
#include <emscripten.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "readstat.h"

#define OUTPUT_LIMIT (48 * 1024 * 1024)
#define CELL_TEXT_LIMIT 4096
#define LABEL_TEXT_LIMIT 1024
#define LABEL_ENTRY_LIMIT 200000
#define NOTE_LIMIT 256

enum { RS_OK = 0, RS_INVALID = 1, RS_LIMIT = 2, RS_ENCODING = 3 };
enum { FORMAT_SAV, FORMAT_POR, FORMAT_DTA, FORMAT_SAS7BDAT, FORMAT_XPT };

EM_JS(double, js_read, (double position, unsigned char *buffer, double length), {
  return Module.readAt(position, HEAPU8.subarray(buffer, buffer + length));
});

typedef struct { char *data; size_t length, capacity; } buffer_t;
static double file_position, file_size;
static buffer_t out, section_meta, section_variables, section_labels, section_notes;
static buffer_t *target = &out;
static size_t total_length;
static int out_overflow, label_entries, notes, row_open, col_start, col_end;
static long last_row;
static char current_label_set[256];

static int io_open(const char *path, void *ctx) { file_position = 0; return 0; }
static int io_close(void *ctx) { return 0; }
static readstat_off_t io_seek(readstat_off_t offset, readstat_io_flags_t whence, void *ctx) {
  double next = whence == READSTAT_SEEK_SET ? (double)offset : whence == READSTAT_SEEK_CUR ? file_position + offset : file_size + offset;
  if (next < 0 || next > file_size) return -1;
  file_position = next;
  return (readstat_off_t)next;
}
static ssize_t io_read(void *buffer, size_t length, void *ctx) {
  double available = file_size - file_position;
  double wanted = (double)length < available ? (double)length : available;
  if (wanted <= 0) return 0;
  double got = js_read(file_position, buffer, wanted);
  if (got < 0) return -1;
  file_position += got;
  return (ssize_t)got;
}
static readstat_error_t io_update(long size, readstat_progress_handler handler, void *user, void *ctx) { return READSTAT_OK; }

static void put(const char *bytes, size_t length) {
  if (out_overflow) return;
  if (total_length + length > OUTPUT_LIMIT) { out_overflow = 1; return; }
  if (target->length + length > target->capacity) {
    size_t capacity = target->capacity ? target->capacity : 4096;
    while (capacity < target->length + length) capacity *= 2;
    char *grown = realloc(target->data, capacity);
    if (!grown) { out_overflow = 1; return; }
    target->data = grown; target->capacity = capacity;
  }
  memcpy(target->data + target->length, bytes, length);
  target->length += length;
  total_length += length;
}
static void use(buffer_t *buffer) { target = buffer; }
static void append_section(buffer_t *section) { put(section->data, section->length); }
static void puts_raw(const char *text) { put(text, strlen(text)); }

static void put_string(const char *text, size_t limit) {
  if (!text) { puts_raw("\"\""); return; }
  size_t length = strlen(text), cut = length;
  if (cut > limit) { cut = limit; while (cut > 0 && ((unsigned char)text[cut] & 0xC0) == 0x80) cut--; }
  put("\"", 1);
  size_t start = 0;
  for (size_t i = 0; i < cut; i++) {
    unsigned char c = (unsigned char)text[i];
    if (c >= 0x20 && c != '"' && c != '\\') continue;
    put(text + start, i - start);
    char escape[8];
    if (c == '"' || c == '\\') snprintf(escape, sizeof escape, "\\%c", c);
    else snprintf(escape, sizeof escape, "\\u%04x", c);
    puts_raw(escape);
    start = i + 1;
  }
  put(text + start, cut - start);
  if (cut < length) puts_raw("\xE2\x80\xA6");
  put("\"", 1);
}

static void put_double(double value) {
  char text[40];
  if (!isfinite(value)) { puts_raw("null"); return; }
  snprintf(text, sizeof text, "%.17g", value);
  puts_raw(text);
}
static void put_float(float value) {
  char text[40];
  if (!isfinite(value)) { puts_raw("null"); return; }
  for (int precision = 6; precision <= 9; precision++) {
    snprintf(text, sizeof text, "%.*g", precision, (double)value);
    if (strtof(text, NULL) == value) break;
  }
  puts_raw(text);
}

static void put_value(readstat_value_t value, size_t text_limit) {
  if (readstat_value_is_tagged_missing(value)) {
    char tag[24];
    snprintf(tag, sizeof tag, "{\"t\":\"%c\"}", readstat_value_tag(value) >= 0x20 ? readstat_value_tag(value) : '?');
    puts_raw(tag);
    return;
  }
  if (readstat_value_is_system_missing(value)) { puts_raw("null"); return; }
  char text[24];
  switch (readstat_value_type(value)) {
    case READSTAT_TYPE_STRING: case READSTAT_TYPE_STRING_REF: put_string(readstat_string_value(value), text_limit); break;
    case READSTAT_TYPE_INT8: snprintf(text, sizeof text, "%d", readstat_int8_value(value)); puts_raw(text); break;
    case READSTAT_TYPE_INT16: snprintf(text, sizeof text, "%d", readstat_int16_value(value)); puts_raw(text); break;
    case READSTAT_TYPE_INT32: snprintf(text, sizeof text, "%d", readstat_int32_value(value)); puts_raw(text); break;
    case READSTAT_TYPE_FLOAT: put_float(readstat_float_value(value)); break;
    default: put_double(readstat_double_value(value)); break;
  }
}

static void put_number_field(const char *name, double value, int comma) {
  if (comma) put(",", 1);
  put_string(name, 64); put(":", 1); put_double(value);
}

static int metadata_handler(readstat_metadata_t *meta, void *ctx) {
  use(&section_meta);
  section_meta.length = 0;
  puts_raw("{");
  put_number_field("rows", (double)readstat_get_row_count(meta), 0);
  put_number_field("variables", (double)readstat_get_var_count(meta), 1);
  put_number_field("created", (double)readstat_get_creation_time(meta), 1);
  put_number_field("modified", (double)readstat_get_modified_time(meta), 1);
  put_number_field("version", (double)readstat_get_file_format_version(meta), 1);
  put_number_field("compression", (double)readstat_get_compression(meta), 1);
  put_number_field("endianness", (double)readstat_get_endianness(meta), 1);
  put_number_field("is64bit", (double)readstat_get_file_format_is_64bit(meta), 1);
  puts_raw(",\"table\":"); put_string(readstat_get_table_name(meta), LABEL_TEXT_LIMIT);
  puts_raw(",\"label\":"); put_string(readstat_get_file_label(meta), LABEL_TEXT_LIMIT);
  puts_raw(",\"encoding\":"); put_string(readstat_get_file_encoding(meta), 64);
  puts_raw("}");
  return out_overflow ? READSTAT_HANDLER_ABORT : READSTAT_HANDLER_OK;
}

static int variable_handler(int index, readstat_variable_t *variable, const char *labels, void *ctx) {
  use(&section_variables);
  if (section_variables.length) put(",", 1);
  puts_raw("{\"name\":"); put_string(readstat_variable_get_name(variable), LABEL_TEXT_LIMIT);
  puts_raw(",\"label\":"); put_string(readstat_variable_get_label(variable), LABEL_TEXT_LIMIT);
  puts_raw(",\"format\":"); put_string(readstat_variable_get_format(variable), 64);
  puts_raw(",\"labels\":"); put_string(labels, 256);
  puts_raw(readstat_variable_get_type_class(variable) == READSTAT_TYPE_CLASS_STRING ? ",\"string\":true" : ",\"string\":false");
  put_number_field("storage", (double)readstat_variable_get_storage_width(variable), 1);
  put_number_field("display", (double)readstat_variable_get_display_width(variable), 1);
  put_number_field("measure", (double)readstat_variable_get_measure(variable), 1);
  puts_raw(",\"missing\":[");
  int ranges = readstat_variable_get_missing_ranges_count(variable);
  for (int i = 0; i < ranges; i++) {
    if (i) put(",", 1);
    put("[", 1); put_value(readstat_variable_get_missing_range_lo(variable, i), LABEL_TEXT_LIMIT);
    put(",", 1); put_value(readstat_variable_get_missing_range_hi(variable, i), LABEL_TEXT_LIMIT); put("]", 1);
  }
  puts_raw("]}");
  return out_overflow ? READSTAT_HANDLER_ABORT : READSTAT_HANDLER_OK;
}

static int value_label_handler(const char *set, readstat_value_t value, const char *label, void *ctx) {
  if (++label_entries > LABEL_ENTRY_LIMIT) { out_overflow = 1; return READSTAT_HANDLER_ABORT; }
  use(&section_labels);
  if (strcmp(set, current_label_set) != 0) {
    puts_raw(current_label_set[0] ? "]},{\"name\":" : "{\"name\":");
    put_string(set, 256);
    puts_raw(",\"values\":[");
    snprintf(current_label_set, sizeof current_label_set, "%s", set);
  } else put(",", 1);
  put("[", 1); put_value(value, LABEL_TEXT_LIMIT); put(",", 1); put_string(label, LABEL_TEXT_LIMIT); put("]", 1);
  return out_overflow ? READSTAT_HANDLER_ABORT : READSTAT_HANDLER_OK;
}

static int note_handler(int index, const char *note, void *ctx) {
  if (notes >= NOTE_LIMIT) return READSTAT_HANDLER_OK;
  use(&section_notes);
  if (notes++) put(",", 1);
  put_string(note, LABEL_TEXT_LIMIT);
  return out_overflow ? READSTAT_HANDLER_ABORT : READSTAT_HANDLER_OK;
}

static int window_variable_handler(int index, readstat_variable_t *variable, const char *labels, void *ctx) {
  return index >= col_start && index < col_end ? READSTAT_HANDLER_OK : READSTAT_HANDLER_SKIP_VARIABLE;
}

static int value_handler(int row, readstat_variable_t *variable, readstat_value_t value, void *ctx) {
  if (!row_open || row != last_row) {
    puts_raw(row_open ? "],[" : "[");
    row_open = 1; last_row = row;
  } else put(",", 1);
  put_value(value, CELL_TEXT_LIMIT);
  return out_overflow ? READSTAT_HANDLER_ABORT : READSTAT_HANDLER_OK;
}

static readstat_error_t run(readstat_parser_t *parser, int format) {
  readstat_set_open_handler(parser, io_open);
  readstat_set_close_handler(parser, io_close);
  readstat_set_seek_handler(parser, io_seek);
  readstat_set_read_handler(parser, io_read);
  readstat_set_update_handler(parser, io_update);
  switch (format) {
    case FORMAT_SAV: return readstat_parse_sav(parser, "input", NULL);
    case FORMAT_POR: return readstat_parse_por(parser, "input", NULL);
    case FORMAT_DTA: return readstat_parse_dta(parser, "input", NULL);
    case FORMAT_SAS7BDAT: return readstat_parse_sas7bdat(parser, "input", NULL);
    case FORMAT_XPT: return readstat_parse_xport(parser, "input", NULL);
    default: return READSTAT_ERROR_PARSE;
  }
}

static void reset(double size) {
  file_size = size; file_position = 0; out_overflow = 0; total_length = 0;
  out.length = section_meta.length = section_variables.length = section_labels.length = section_notes.length = 0;
  use(&out);
  label_entries = 0; notes = 0; row_open = 0; last_row = -1;
  current_label_set[0] = 0;
}

static int status(readstat_error_t error) {
  if (out_overflow) return RS_LIMIT;
  if (error == READSTAT_OK) return RS_OK;
  if (error == READSTAT_ERROR_UNSUPPORTED_CHARSET || error == READSTAT_ERROR_CONVERT || error == READSTAT_ERROR_CONVERT_BAD_STRING) return RS_ENCODING;
  return RS_INVALID;
}

EMSCRIPTEN_KEEPALIVE int rs_schema(int format, double size) {
  reset(size);
  readstat_parser_t *parser = readstat_parser_init();
  readstat_set_metadata_handler(parser, metadata_handler);
  readstat_set_variable_handler(parser, variable_handler);
  readstat_set_value_label_handler(parser, value_label_handler);
  readstat_set_note_handler(parser, note_handler);
  readstat_error_t error = run(parser, format);
  readstat_parser_free(parser);
  if (out_overflow) return RS_LIMIT;
  total_length = 0;
  use(&out);
  puts_raw("{\"meta\":");
  if (section_meta.length) append_section(&section_meta); else puts_raw("null");
  puts_raw(",\"variables\":["); append_section(&section_variables);
  puts_raw("],\"labels\":["); append_section(&section_labels);
  if (current_label_set[0]) puts_raw("]}");
  puts_raw("],\"notes\":["); append_section(&section_notes);
  // Trailing value-label damage still leaves a usable table; rows are validated separately.
  int partial = error != READSTAT_OK && section_meta.length && section_variables.length;
  puts_raw(partial ? "],\"incomplete\":true}" : "]}");
  return partial ? status(READSTAT_OK) : status(error);
}

EMSCRIPTEN_KEEPALIVE int rs_rows(int format, double size, int offset, int limit, int first_column, int last_column) {
  reset(size);
  col_start = first_column; col_end = last_column;
  readstat_parser_t *parser = readstat_parser_init();
  readstat_set_variable_handler(parser, window_variable_handler);
  readstat_set_value_handler(parser, value_handler);
  readstat_set_row_offset(parser, offset);
  readstat_set_row_limit(parser, limit);
  puts_raw("[");
  readstat_error_t error = run(parser, format);
  readstat_parser_free(parser);
  puts_raw(row_open ? "]]" : "]");
  return status(error);
}

EMSCRIPTEN_KEEPALIVE const char *rs_output(void) { return out.data; }
EMSCRIPTEN_KEEPALIVE int rs_output_length(void) { return (int)out.length; }

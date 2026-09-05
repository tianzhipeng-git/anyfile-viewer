/* SPDX-License-Identifier: LGPL-3.0-or-later
 * Anyfile's replaceable libmobi adapter. No decryption is compiled in. */
#include <mobi.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
static MOBIData *book;
static MOBIRawml *raw;
static MOBIPart *parts[10000];
static char names[10000][64];
static char types[10000][30];
static unsigned count;
static char title[1024];
void close_book(void) {
    if (raw) mobi_free_rawml(raw);
    if (book) mobi_free(book);
    raw = NULL; book = NULL; count = 0;
}
static int collect(MOBIPart *p, const char *prefix) {
    while (p) {
        if (count == 10000 || p->size > 32*1024*1024) return 3;
        parts[count] = p;
        MOBIFileMeta meta = mobi_get_filemeta_by_type(p->type);
        snprintf(names[count], 64, "%s%05zu.%s", prefix, p->uid, meta.extension);
        memcpy(types[count], meta.mime_type, 30);
        count++; p = p->next;
    }
    return 0;
}
int open_book(unsigned char *data, unsigned size) {
    close_book();
    book = mobi_init();
    if (!book) return 3;
    FILE *f = fmemopen(data, size, "rb");
    if (!f) return 3;
    MOBI_RET ret = mobi_load_file(book, f);
    fclose(f);
    if (ret != MOBI_SUCCESS) return 1;
    if (mobi_is_encrypted(book) || (book->next && mobi_is_encrypted(book->next))) return 2;
    if (mobi_is_replica(book) || mobi_is_dictionary(book)) return 4;
    if (mobi_get_text_maxsize(book) > 32*1024*1024) return 3;
    mobi_get_fullname(book, title, sizeof(title));
    raw = mobi_init_rawml(book);
    if (!raw) return 3;
    ret = mobi_parse_rawml_opt(raw, book, true, false, true);
    if (ret != MOBI_SUCCESS) return ret == MOBI_MALLOC_FAILED ? 3 : 1;
    int status = collect(raw->markup, "part");
    if (!status && raw->flow) status = collect(raw->flow->next, "flow");
    if (!status) status = collect(raw->resources, "resource");
    return status;
}
unsigned part_count(void) { return count; }
const char *part_name(unsigned i) { return i < count ? names[i] : ""; }
unsigned part_size(unsigned i) { return i < count ? parts[i]->size : 0; }
const void *part_data(unsigned i) { return i < count ? parts[i]->data : NULL; }
const char *part_type(unsigned i) { return i < count ? types[i] : ""; }
const char *book_title(void) { return title; }

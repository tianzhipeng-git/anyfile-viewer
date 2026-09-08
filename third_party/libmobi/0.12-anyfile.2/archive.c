/* SPDX-License-Identifier: Apache-2.0 */
#include <archive.h>
#include <archive_entry.h>
#include <stdint.h>
#include <stdlib.h>
static struct archive *reader;
static struct archive_entry *entry;
void close_archive(void) { if (reader) archive_read_free(reader); reader = NULL; entry = NULL; }
int open_archive(void *data, unsigned size, int kind) {
    close_archive();
    reader = archive_read_new();
    if (!reader) return -30;
    if (kind == 4) archive_read_support_format_rar(reader);
    else if (kind == 5) archive_read_support_format_rar5(reader);
    else if (kind == 7) archive_read_support_format_7zip(reader);
    else return -30;
    return archive_read_open_memory(reader, data, size);
}
int next_entry(void) { return archive_read_next_header(reader, &entry); }
const char *entry_name(void) { return archive_entry_pathname_utf8(entry); }
double entry_size(void) { return archive_entry_size(entry); }
int entry_kind(void) { return archive_entry_filetype(entry); }
int entry_link(void) { return archive_entry_symlink(entry) != NULL || archive_entry_hardlink(entry) != NULL; }
int entry_encrypted(void) { return archive_entry_is_encrypted(entry) || archive_read_has_encrypted_entries(reader) > 0; }
int read_entry(void *buffer, unsigned size) { return archive_read_data(reader, buffer, size); }
const char *archive_error(void) { return archive_error_string(reader); }

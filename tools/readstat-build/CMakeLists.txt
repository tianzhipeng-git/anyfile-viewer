cmake_minimum_required(VERSION 3.16)
project(anyfile_readstat C)
set(CMAKE_C_STANDARD 99)
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -O2 -sUSE_ZLIB=1")
set(RS ${SOURCE_ROOT}/readstat-1.1.9/src)
set(READSTAT_FILES
  CKHashTable readstat_bits readstat_convert readstat_error readstat_io_unistd readstat_malloc
  readstat_metadata readstat_parser readstat_value readstat_variable
  sas/ieee sas/readstat_sas sas/readstat_sas7bdat_read sas/readstat_sas_rle sas/readstat_xport
  sas/readstat_xport_read sas/readstat_xport_parse_format
  spss/readstat_por spss/readstat_por_parse spss/readstat_por_read spss/readstat_sav spss/readstat_sav_compress
  spss/readstat_sav_parse spss/readstat_sav_parse_timestamp spss/readstat_sav_read spss/readstat_spss
  spss/readstat_spss_parse spss/readstat_zsav_compress spss/readstat_zsav_read
  stata/readstat_dta stata/readstat_dta_parse_timestamp stata/readstat_dta_read)
foreach(name IN LISTS READSTAT_FILES)
  list(APPEND READSTAT_SOURCES ${RS}/${name}.c)
endforeach()
add_executable(readstat ${CMAKE_CURRENT_SOURCE_DIR}/adapter.c ${READSTAT_SOURCES})
target_include_directories(readstat PRIVATE ${RS})
target_compile_definitions(readstat PRIVATE HAVE_ZLIB=1 NDEBUG)
set_target_properties(readstat PROPERTIES SUFFIX ".mjs")
target_link_options(readstat PRIVATE -sUSE_ZLIB=1 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node
  -sALLOW_MEMORY_GROWTH=1 -sMAXIMUM_MEMORY=268435456 -sSTACK_SIZE=1048576 -sFILESYSTEM=0
  -sEXPORTED_FUNCTIONS=_rs_schema,_rs_rows,_rs_output,_rs_output_length
  -sEXPORTED_RUNTIME_METHODS=HEAPU8)

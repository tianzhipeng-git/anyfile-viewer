# 样例

| 文件 | 来源 | 用途 |
|---|---|---|
| `iris.sav` | [haven](https://github.com/tidyverse/haven) `inst/examples`，MIT | SPSS：150 行、值标签 |
| `labelled-num-na.sav`、`umlauts.sav` | haven `tests/testthat/spss`，MIT | SPSS 用户缺失值；UTF-8 标签 |
| `sample.por` | haven `tests/testthat/spss`，MIT | SPSS 可移植文件、日期、值标签、未知行数 |
| `stata14_118.dta`、`stata13_dates.dta`、`stata-compat-105.dta` | [pandas](https://github.com/pandas-dev/pandas) `pandas/tests/io/data/stata`，BSD-3-Clause | Stata 118 strL Unicode；`%tc`/`%td` 日期；105 旧版（值标签尾部损坏 → `incomplete`） |
| `tagged-na-double.dta` | haven `tests/testthat/stata`，MIT | Stata 标记缺失值 `.a`–`.z` 与其值标签 |
| `airline.sas7bdat`、`datetime.sas7bdat`、`many_columns.sas7bdat` | pandas `pandas/tests/io/sas/data`，BSD-3-Clause | SAS 数值、日期/日期时间/MINGUO、392 列与 `._` 特殊缺失 |
| `paxraw_d_short.xpt` | pandas `pandas/tests/io/sas/data`（CDC NHANES 摘录），BSD-3-Clause | SAS XPORT v5 |
| `corrupt.sas7bdat` | pandas `pandas/tests/io/sas/data`，BSD-3-Clause | 负样例：签名有效但内容损坏，打开时拒绝 |

# Bundled interface fonts

These are the same 14 font families used by the interface and theme picker.
`app/layout.tsx` loads the checked-in WOFF2 files through `next/font/local`, so
production builds and browsers do not contact Google to obtain fonts. CSS variable
names, configured static weights, variable weight ranges and optical sizing are
retained. Full font character coverage is preserved.

The original fonts and each family's unmodified `OFL.txt` come from the official
[Google Fonts repository](https://github.com/google/fonts), pinned to the commit
in `sources.json`. That manifest records the exact source URLs, original file
hashes and bundled file hashes. FontTools 4.60.1 converted TrueType to WOFF2;
there was no glyph subsetting or design change. The original SIL Open Font
License notices are distributed beside their fonts.

To update a font, choose a reviewed upstream commit, retain its license, convert
the original TrueType file to WOFF2 with FontTools, and update `sources.json`.
No download or conversion is performed by installation, the app or its build.

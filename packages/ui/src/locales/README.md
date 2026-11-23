# CSL locale data

`csl-it-IT.xml` is the unmodified Italian locale from
[citation-style-language/locales](https://github.com/citation-style-language/locales/blob/8bef426f89f38c0789223c50e53ec2197bc50bb3/locales-it-IT.xml),
commit `8bef426f89f38c0789223c50e53ec2197bc50bb3`.

- Authors/translators: Filippo Vomiero and Pietro Liuzzo (attribution also retained in the XML).
- License: [Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
- SHA256: `71ac17266a44a9054f4203d75fcf7a14588c621d06280177902bbc922f124778`.

The bundled citation-js locale subset has no Italian data. Reader loads this data
lazily from its own deployment when the citation-output locale is Italian, rather
than silently formatting Italian citations with the English fallback. This is
separate from the interface language and does not change source metadata.

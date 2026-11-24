## Fixed

- The Chrome extension publisher no longer stops with `store-line-artifact-required` when GitHub briefly lists no artifacts for a store-line run that has just completed. It re-reads an empty listing up to six times, five seconds apart, before refusing.

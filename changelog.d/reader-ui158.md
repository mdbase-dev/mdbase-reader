## Fixed

- Align Reader and the extension on SDK beta.159, including authenticated LAB and staging originals, and shared UI and i18n beta.158.
- Replace Reader's command palette fork with the shared palette, retaining the Reader shortcut reference and preventing Enter during text composition from running a command.
- Follow partial query pages with a continuation and accept complete final pages without guessing incompleteness from their size.
- Verify that Stop during an upload commit frees the next upload's lane without discarding an already captured write.

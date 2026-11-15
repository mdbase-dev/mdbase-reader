## Changed

- Identify a source's documents by their `file` link rather than the Connect file ID recorded beside it. Highlights, notes, reading positions, document ranges and the library text index now match a document by its collection path, so they keep working when a daemon assigns new IDs to unchanged files. Reader still writes `file_id` where it knows one, and saves the reading position's document as `document_file`.

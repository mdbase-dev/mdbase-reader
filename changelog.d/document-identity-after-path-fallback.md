## Fixed

- Save highlights and notes, show existing highlights and resume reading in documents whose Connect file ID changed, such as collections moved to the new mdbase daemon. Reader opened these files by path but then treated them as a different document, so saving failed with "The selected document does not belong to this source."

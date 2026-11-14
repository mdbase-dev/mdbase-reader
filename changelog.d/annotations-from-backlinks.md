## Fixed

- Open a source's annotations, the annotations overview and each source's annotation count in collections with more than 1000 records. Reader now finds a source's annotations through the collection's link index, and resolves annotation links through the replica's link resolver, instead of link-following queries that refused with "This annotation query is too large".

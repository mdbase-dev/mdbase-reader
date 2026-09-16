export function annotationFixture(sources, blocked) {
  const records = [];
  let serial = 0;
  return (sourceId, request, respond) => {
    if (request.method() !== "PUT")
      return respond(records.filter((record) => record.sourceId === sourceId));
    const input = request.postDataJSON();
    if (blocked() && input.op !== "plan-delete")
      return respond({ error: "[test] Annotation write unavailable" }, 503);
    if (input.op === "create") {
      const id = `test-annotation-${++serial}`;
      const annotation = {
        ...input.request,
        id,
        path: `annotations/${id}.md`,
        recordRevision: `annotation-${serial}`,
        createdAt: new Date().toISOString(),
      };
      records.push(annotation);
      return respond(annotation);
    }
    const index = records.findIndex(({ id }) => id === input.annotation.id);
    if (input.op === "plan-delete")
      return respond({
        annotationId: input.annotation.id,
        path: input.annotation.path,
        expectedRevision: input.annotation.recordRevision,
        brokenLinkPaths: sources
          .filter(({ body }) => body.includes(input.annotation.id))
          .map(({ path }) => path),
      });
    if (input.op === "delete") {
      records.splice(index, 1);
      return respond(null);
    }
    if (index < 0 || records[index].recordRevision !== input.annotation.recordRevision)
      return respond({ error: "[test] Concurrent edit" }, 409);
    records[index] = {
      ...records[index],
      body: input.body,
      recordRevision: `annotation-${++serial}`,
    };
    return respond(records[index]);
  };
}

import { safeArtifact, safeRun, assertRunMetadata } from "./native-artifact-evidence.mjs";
export function assertArtifactMetadata(meta, expected) {
  if (
    meta.id !== Number(expected.id) ||
    meta.expired !== false ||
    meta.digest !== expected.digest ||
    !/^sha256:[a-f0-9]{64}$/.test(meta.digest ?? "") ||
    meta.name !== `reader-native-build-${expected.target}-${expected.run}-${expected.attempt}` ||
    meta.workflow_run?.id !== Number(expected.run) ||
    meta.workflow_run?.head_sha !== expected.source ||
    meta.workflow_run?.head_repository_id !== Number(expected.repositoryId)
  )
    throw Error("Artifact immutable identity refused");
}
export async function metadataPhase({ expected, get, save, state, after = false }) {
  for (const [stage, path, project, validate] of [
    [
      after ? "after" : "before",
      `/actions/artifacts/${expected.id}`,
      safeArtifact,
      assertArtifactMetadata,
    ],
    [after ? "runAfter" : "run", `/actions/runs/${expected.run}`, safeRun, assertRunMetadata],
  ]) {
    let fetched = false;
    try {
      state.stage = stage;
      state.reason = "metadata-lookup-pending";
      await save(state);
      const response = await get(path);
      state[stage] = project(response);
      fetched = true;
      state.reason = "metadata-validation-pending";
      await save(state);
      validate(state[stage], expected);
      state.reason = "metadata-validated";
      await save(state);
    } catch {
      state.reason = fetched ? "metadata-validation-refused" : "metadata-lookup-refused";
      await save(state);
      throw Error(`Artifact metadata ${stage} refused`);
    }
  }
  return state[after ? "after" : "before"];
}

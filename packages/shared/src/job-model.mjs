export const JobStatus = Object.freeze({
  CREATED: 'created',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  RETRYING: 'retrying',
  COMPLETED: 'completed',
  FAILED: 'failed'
});

export const PipelineType = Object.freeze({
  MODEL_OPTIMIZATION: 'model-optimization',
  AREA_TARGET_PROCESSING: 'area-target-processing'
});

export const ArtifactType = Object.freeze({
  GLB: 'glb',
  ASSET_BUNDLE: 'asset-bundle'
});

export function createQueuePayload({ jobId, pipelineType }) {
  if (!jobId) {
    throw new Error('jobId is required');
  }

  if (!pipelineType) {
    throw new Error('pipelineType is required');
  }

  return {
    jobId,
    pipelineType
  };
}

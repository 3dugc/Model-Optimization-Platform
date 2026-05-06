export const JobStatus = Object.freeze({
  CREATED: 'created',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  RETRYING: 'retrying',
  COMPLETED: 'completed',
  FAILED: 'failed'
});

export const OptimizationPreset = Object.freeze({
  FAST: 'fast',
  BALANCED: 'balanced',
  MAXIMUM: 'maximum'
});

export function createJobMessage({ jobId, sourceKey, preset = OptimizationPreset.BALANCED, options = {} }) {
  if (!jobId) {
    throw new Error('jobId is required');
  }

  if (!sourceKey) {
    throw new Error('sourceKey is required');
  }

  return {
    jobId,
    sourceKey,
    preset,
    options
  };
}

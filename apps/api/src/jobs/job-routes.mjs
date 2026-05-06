export function buildCreateJobResponse({ jobId, sourceKey, uploadUrl }) {
  return { jobId, sourceKey, uploadUrl };
}

export function buildJobStatusResponse(job) {
  return {
    jobId: job.id,
    pipelineType: job.pipelineType,
    status: job.status,
    sourceKey: job.sourceKey,
    resultKey: job.resultKey,
    artifactType: job.artifactType,
    attempts: job.attempts,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt
  };
}

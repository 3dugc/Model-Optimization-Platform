export async function runModelOptimizationJob({ job, optimizerUrl, tempDir }) {
  if (!job.sourceKey) {
    throw new Error('job.sourceKey is required');
  }

  return {
    resultKey: `results/${job.id}/optimized.glb`,
    artifactType: 'glb',
    metadata: {
      optimizerUrl,
      tempDir
    }
  };
}

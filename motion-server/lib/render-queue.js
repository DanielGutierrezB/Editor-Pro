/**
 * RenderQueue — In-memory async job queue for Remotion renders.
 * Processes one job at a time (Remotion can only render one composition at a time).
 * Auto-cleans completed/errored jobs after 30 minutes.
 */

let _jobCounter = 0;

function RenderQueue() {
  this.jobs = {};        // id → job
  this.queue = [];       // ordered list of job ids waiting to be processed
  this.currentJobId = null;
  this._cleanupTimer = setInterval(this._cleanup.bind(this), 60 * 1000); // check every minute
}

/**
 * Enqueue a new render job.
 * @param {object} opts - { compositionId, outputDir, sessionDir }
 * @returns {object} job - { id, compositionId, status, ... }
 */
RenderQueue.prototype.enqueue = function(opts) {
  var id = 'rj_' + (++_jobCounter) + '_' + Date.now();
  var job = {
    id: id,
    compositionId: opts.compositionId,
    outputDir: opts.outputDir || null,
    sessionDir: opts.sessionDir || null,
    durationFrames: opts.durationFrames || null,  // override for "Animar" (match timeline clip)
    status: 'queued',  // queued | rendering | complete | error
    result: null,
    error: null,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
  };
  this.jobs[id] = job;
  this.queue.push(id);
  console.log('[RenderQueue] Enqueued job ' + id + ' for ' + opts.compositionId + ' (queue length: ' + this.queue.length + ')');
  // Kick off processing if idle
  this._processNext();
  return job;
};

/**
 * Get a job by id.
 * @returns {object|null}
 */
RenderQueue.prototype.getJob = function(id) {
  return this.jobs[id] || null;
};

/**
 * Internal: process next job in queue if not already rendering.
 */
RenderQueue.prototype._processNext = function() {
  if (this.currentJobId) return; // already rendering
  if (this.queue.length === 0) return; // nothing to do

  var jobId = this.queue.shift();
  var job = this.jobs[jobId];
  if (!job) {
    // Job was cleaned up before processing, skip
    this._processNext();
    return;
  }

  this.currentJobId = jobId;
  job.status = 'rendering';
  job.startedAt = Date.now();
  console.log('[RenderQueue] Starting render for job ' + jobId + ' (' + job.compositionId + ')');

  // The actual render is delegated via the callback set by the router
  if (typeof this._renderFn === 'function') {
    var self = this;
    this._renderFn(job, function(err, result) {
      if (err) {
        job.status = 'error';
        job.error = err.message || String(err);
        console.error('[RenderQueue] Job ' + jobId + ' failed: ' + job.error);
      } else {
        job.status = 'complete';
        job.result = result;
        console.log('[RenderQueue] Job ' + jobId + ' complete: ' + (result && result.mp4Path));
      }
      job.completedAt = Date.now();
      self.currentJobId = null;
      // Process next in queue
      self._processNext();
    });
  } else {
    job.status = 'error';
    job.error = 'No render function configured';
    job.completedAt = Date.now();
    this.currentJobId = null;
    this._processNext();
  }
};

/**
 * Set the render function that actually performs the render.
 * @param {function} fn - function(job, callback) where callback is (err, result)
 */
RenderQueue.prototype.setRenderFn = function(fn) {
  this._renderFn = fn;
};

/**
 * Internal: clean up completed/errored jobs older than 30 minutes.
 */
RenderQueue.prototype._cleanup = function() {
  var now = Date.now();
  var maxAge = 30 * 60 * 1000; // 30 minutes
  var ids = Object.keys(this.jobs);
  var cleaned = 0;
  for (var i = 0; i < ids.length; i++) {
    var job = this.jobs[ids[i]];
    if ((job.status === 'complete' || job.status === 'error') &&
        job.completedAt && (now - job.completedAt > maxAge)) {
      delete this.jobs[ids[i]];
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log('[RenderQueue] Cleaned ' + cleaned + ' old jobs');
  }
};

/**
 * Destroy the queue (cleanup timer).
 */
RenderQueue.prototype.destroy = function() {
  if (this._cleanupTimer) {
    clearInterval(this._cleanupTimer);
    this._cleanupTimer = null;
  }
};

module.exports = RenderQueue;

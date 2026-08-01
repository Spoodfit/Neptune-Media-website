import { Container } from '@cloudflare/containers';

const VIDEO_PORT = 8080;
const START_OPTIONS = {
  ports: [VIDEO_PORT],
  startOptions: { enableInternet: true },
  cancellationOptions: {
    instanceGetTimeoutMS: 60_000,
    portReadyTimeoutMS: 180_000,
    waitInterval: 500,
  },
};

export class VideoProcessorV2 extends Container {
  defaultPort = VIDEO_PORT;
  requiredPorts = [VIDEO_PORT];
  pingEndpoint = 'localhost/health';
  enableInternet = true;
  sleepAfter = '6h';

  async warm() {
    await this.ensureReady();
    const state = await this.getState();
    return { ok: state.status === 'healthy', containerState: state.status, exitCode: state.exitCode ?? null };
  }

  async dispatchJob(payload) {
    try {
      await this.ensureReady();
      const response = await this.containerFetch('http://localhost/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      }, VIDEO_PORT);
      const result = await response.json().catch(() => ({}));
      const state = await this.getState();
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: String(result?.detail || result?.error || `container_http_${response.status}`).slice(0, 500),
          containerState: state.status,
          exitCode: state.exitCode ?? null,
        };
      }
      this.renewActivityTimeout();
      return {
        ok: true,
        accepted: result.accepted !== false,
        deduplicated: Boolean(result.deduplicated),
        jobId: String(result.jobId || payload?.jobId || ''),
        stage: String(result.stage || 'starting'),
        progress: Number(result.progress || 8),
        containerState: state.status,
      };
    } catch (error) {
      const state = await this.getState().catch(() => ({ status: 'unavailable' }));
      return {
        ok: false,
        error: String(error?.message || error || 'container_dispatch_unknown').slice(0, 700),
        containerState: state.status || 'unavailable',
        exitCode: state.exitCode ?? null,
      };
    }
  }

  async readJob(jobId) {
    const state = await this.getState().catch(() => ({ status: 'unavailable' }));
    if (state.status !== 'healthy') {
      return {
        ok: true,
        found: false,
        containerState: state.status || 'unavailable',
        exitCode: state.exitCode ?? null,
      };
    }
    try {
      const response = await this.containerFetch(`http://localhost/jobs/${encodeURIComponent(String(jobId || ''))}`, {
        headers: { Accept: 'application/json' },
      }, VIDEO_PORT);
      if (response.status === 404) {
        return { ok: true, found: false, containerState: state.status, exitCode: state.exitCode ?? null };
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          ok: false,
          found: false,
          containerState: state.status,
          exitCode: state.exitCode ?? null,
          error: String(result?.detail || result?.error || `container_http_${response.status}`).slice(0, 500),
        };
      }
      this.renewActivityTimeout();
      return { ok: true, found: true, containerState: state.status, exitCode: state.exitCode ?? null, job: result };
    } catch (error) {
      return {
        ok: false,
        found: false,
        containerState: state.status || 'unavailable',
        exitCode: state.exitCode ?? null,
        error: String(error?.message || error || 'container_read_unknown').slice(0, 500),
      };
    }
  }

  async fetch(request) {
    await this.ensureReady();
    this.renewActivityTimeout();
    return this.containerFetch(request, VIDEO_PORT);
  }

  async ensureReady() {
    await this.startAndWaitForPorts(START_OPTIONS);
  }

  onStart() {
    console.log('video_processor_container_started');
  }

  onStop({ exitCode, reason }) {
    console.log('video_processor_container_stopped', { exitCode, reason });
  }

  onError(error) {
    console.error('video_processor_container_start_failed', {
      name: String(error?.name || 'Error').slice(0, 120),
      message: String(error?.message || error || 'unknown').slice(0, 500),
    });
    throw error;
  }
}

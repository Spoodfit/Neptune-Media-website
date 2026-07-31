import { Container } from '@cloudflare/containers';

const VIDEO_PORT = 8080;

export class VideoProcessorV2 extends Container {
  defaultPort = VIDEO_PORT;
  requiredPorts = [VIDEO_PORT];
  pingEndpoint = 'localhost/health';
  enableInternet = true;
  sleepAfter = '6h';

  async fetch(request) {
    try {
      await this.startAndWaitForPorts({
        ports: [VIDEO_PORT],
        startOptions: { enableInternet: true },
        cancellationOptions: {
          instanceGetTimeoutMS: 30_000,
          portReadyTimeoutMS: 120_000,
          waitInterval: 500,
        },
      });
      this.renewActivityTimeout();
      return this.containerFetch(request, VIDEO_PORT);
    } catch (error) {
      console.error('video_processor_container_unavailable', {
        name: String(error?.name || 'Error').slice(0, 120),
        message: String(error?.message || error || 'unknown').slice(0, 500),
      });
      throw error;
    }
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

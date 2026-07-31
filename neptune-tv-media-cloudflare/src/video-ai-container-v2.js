import { Container } from '@cloudflare/containers';

export class VideoProcessorV2 extends Container {
  defaultPort = 8080;
  sleepAfter = '10m';
}

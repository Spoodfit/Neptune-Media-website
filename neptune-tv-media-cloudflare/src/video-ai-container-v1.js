import { Container } from '@cloudflare/containers';

export class VideoProcessor extends Container {
  defaultPort = 8080;
  sleepAfter = '20m';
}

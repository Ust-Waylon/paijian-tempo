export class MetronomeAudio {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.context = null;
    this.node = null;
    this.initializing = null;
    this.revision = 0;
  }

  async prepare() {
    if (this.node) return;
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      const context = new AudioContext({ latencyHint: 'interactive' });
      try {
        await context.audioWorklet.addModule(
          new URL('../audio/clock-processor.js', import.meta.url),
        );
        const node = new AudioWorkletNode(context, 'tempo-clock', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        node.port.onmessage = ({ data }) => {
          if (data.transportId === this.revision) this.onMessage(data);
        };
        node.onprocessorerror = () =>
          this.onMessage({
            type: 'error',
            message: '声音引擎已停止。请重新打开应用。',
          });
        node.connect(context.destination);
        this.context = context;
        this.node = node;
        context.onstatechange = () => {
          if (
            context.state === 'suspended' ||
            context.state === 'interrupted' ||
            context.state === 'closed'
          ) {
            this.onMessage({ type: 'interrupted' });
          }
        };
      } catch (error) {
        await context.close();
        throw error;
      }
    })();
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  configure(config) {
    this.node?.port.postMessage({ type: 'configure', config });
  }

  async start(config, elapsed) {
    const revision = ++this.revision;
    await this.prepare();
    await this.context.resume();
    if (revision !== this.revision) return false;
    this.configure(typeof config === 'function' ? config() : config);
    this.node.port.postMessage({
      type: 'start',
      elapsed,
      transportId: revision,
    });
    return true;
  }

  stop() {
    this.revision += 1;
    this.node?.port.postMessage({ type: 'stop', transportId: this.revision });
  }

  reset() {
    this.node?.port.postMessage({ type: 'reset' });
  }

  audibleTime() {
    if (!this.context) return 0;
    const stamp = this.context.getOutputTimestamp?.();
    if (stamp?.contextTime > 0 && stamp.performanceTime > 0) {
      return Math.min(
        this.context.currentTime,
        stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000,
      );
    }
    return (
      this.context.currentTime -
      (this.context.outputLatency || this.context.baseLatency || 0)
    );
  }
}

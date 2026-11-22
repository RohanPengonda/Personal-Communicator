// Records the camera + microphone stream so a session can be replayed later.
export class SessionRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  public start(stream: MediaStream): boolean {
    if (typeof MediaRecorder === 'undefined') return false;

    const mimeType = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4'
    ].find((type) => MediaRecorder.isTypeSupported(type));

    try {
      this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      this.recorder = null;
      return false;
    }

    this.chunks = [];
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder.start(1000);
    return true;
  }

  public stop(): Promise<Blob | null> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') return Promise.resolve(null);

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = this.chunks.length
          ? new Blob(this.chunks, { type: recorder.mimeType || 'video/webm' })
          : null;
        this.recorder = null;
        this.chunks = [];
        resolve(blob);
      };
      recorder.stop();
    });
  }
}

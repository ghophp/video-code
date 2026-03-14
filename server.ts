const port = parseInt(Bun.argv[2] || process.env.PORT || "3000", 10);

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    // API: Convert WebM to MP4 via ffmpeg
    if (url.pathname === "/api/convert" && req.method === "POST") {
      try {
        const formData = await req.formData();
        const video = formData.get("video") as File;
        if (!video) return new Response("No video", { status: 400 });

        const ts = Date.now();
        const inputPath = `/tmp/code-anim-${ts}.webm`;
        const outputPath = `/tmp/code-anim-${ts}.mp4`;

        await Bun.write(inputPath, video);

        const proc = Bun.spawn(
          [
            "ffmpeg",
            "-i", inputPath,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "18",
            "-pix_fmt", "yuv420p",
            "-y", outputPath,
          ],
          { stdout: "ignore", stderr: "ignore" }
        );
        const exitCode = await proc.exited;

        if (exitCode !== 0) {
          return new Response("Conversion failed", { status: 500 });
        }

        const mp4 = Bun.file(outputPath);
        const bytes = await mp4.arrayBuffer();

        // Cleanup
        await Promise.all([
          Bun.file(inputPath).exists().then(() => Bun.spawn(["rm", "-f", inputPath, outputPath])),
        ]);

        return new Response(bytes, {
          headers: { "Content-Type": "video/mp4" },
        });
      } catch {
        return new Response("Conversion not available (install ffmpeg)", { status: 500 });
      }
    }

    // Static files
    let path = url.pathname;
    if (path === "/") path = "/index.html";

    const file = Bun.file(`./public${path}`);
    if (await file.exists()) {
      return new Response(file);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Code Animator running at http://localhost:${server.port}`);

document.addEventListener("DOMContentLoaded", function () {
  const navLinks = document.querySelectorAll(".nav-link, .mobile-nav-link");
  const pages = document.querySelectorAll(".page");
  const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
  const mobileNavLinks = document.getElementById("mobile-nav-links");
  const voiceDemoBtn = document.getElementById("voice-demo-btn");
  const photoacousticDemoBtn = document.getElementById("photoacoustic-demo-btn"); // <-- fixed

  // Function to handle navigation
  function handleNavigation(e) {
    e.preventDefault();

    navLinks.forEach((nav) => nav.classList.remove("active"));
    pages.forEach((page) => page.classList.remove("active"));

    this.classList.add("active");
    const pageId = this.getAttribute("data-page") + "-page";
    const pageEl = document.getElementById(pageId);
    if (pageEl) pageEl.classList.add("active");

    mobileNavLinks.classList.remove("active");
    window.scrollTo(0, 0);
  }

  navLinks.forEach((link) => link.addEventListener("click", handleNavigation));

  // Voice demo button navigation
  if (voiceDemoBtn) {
    voiceDemoBtn.addEventListener("click", function (e) {
      e.preventDefault();
      navLinks.forEach((nav) => nav.classList.remove("active"));
      pages.forEach((page) => page.classList.remove("active"));
      document.getElementById("voice-page").classList.add("active");
      mobileNavLinks.classList.remove("active");
      window.scrollTo(0, 0);
    });
  }

  // Photoacoustic demo btn (keeps original behavior)
  if (photoacousticDemoBtn) {
    photoacousticDemoBtn.addEventListener("click", function (e) {
      e.preventDefault();
      alert("Photoacoustic demo would launch here. This is a prototype demonstration.");
    });
  }

  // Mobile menu toggle
  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener("click", function () {
      mobileNavLinks.classList.toggle("active");
    });
  }

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".header-content") && !e.target.closest(".mobile-nav-links")) {
      mobileNavLinks.classList.remove("active");
    }
  });

  // Voice recording and graph
  const recordBtn = document.getElementById("record-btn");
  const stopBtn = document.getElementById("stop-btn");
  const playBtn = document.getElementById("play-btn");
  const recordingIndicator = document.getElementById("recording-indicator");
  const audioPlayer = document.getElementById("audio-player");
  const analysisResult = document.getElementById("analysis-result");
  const graphCanvas = document.getElementById("voice-graph");
  const status = document.getElementById("status");
  const spinner = document.getElementById("spinner");

  let mediaRecorder;
  let audioChunks = [];
  let audioContext;
  let analyser;
  let dataArray;
  let graphCtx;
  let animationId;
  let mediaStream = null; // store the MediaStream here

  // Canvas sizing helper (handles devicePixelRatio)
  function setCanvasSize(canvas) {
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const cssW = canvas.offsetWidth;
    const cssH = canvas.offsetHeight;
    canvas.width = Math.max(300, Math.floor(cssW * ratio));
    canvas.height = Math.max(150, Math.floor(cssH * ratio));
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    graphCtx = canvas.getContext("2d");
    // scale context so drawing coordinates are in CSS pixels
    graphCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  // Initialize graph
  if (graphCanvas) {
    setCanvasSize(graphCanvas);
    drawEmptyGraph();
    // adapt on resize
    window.addEventListener("resize", () => {
      setCanvasSize(graphCanvas);
      drawEmptyGraph();
    });
  }

  // Feature detect media
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && recordBtn) {
    recordBtn.addEventListener("click", startRecording);
    stopBtn.addEventListener("click", stopRecording);
    playBtn.addEventListener("click", playRecording);
  } else if (recordBtn) {
    recordBtn.disabled = true;
    recordBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> Recording Not Supported';
  }

  function startRecording() {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        mediaStream = stream; // <-- keep reference

        // Audio context + analyser setup
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Recorder
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
          const audioUrl = URL.createObjectURL(audioBlob);
          audioPlayer.src = audioUrl;
          playBtn.disabled = false;

          status.textContent = "Analyzing voice recording...";
          spinner.style.display = "block";

          setTimeout(() => {
            spinner.style.display = "none";
            analysisResult.style.display = "block";
            status.textContent = "Analysis complete. See results below.";

            const randomResult = Math.floor(Math.random() * 15);
            document.querySelector(".result-value").textContent = randomResult + "%";
            drawPhotoacousticGraphFromRecording(randomResult);
          }, 1500);
        };

        mediaRecorder.start();
        recordBtn.disabled = true;
        stopBtn.disabled = false;
        recordingIndicator.classList.add("active");
        audioPlayer.style.display = "none";
        analysisResult.style.display = "none";

        // Start real-time drawing
        drawRealTimeGraph();
      })
      .catch((err) => {
        console.error("Error accessing microphone:", err);
        alert("Unable to access your microphone. Please check permissions and try again.");
      });
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    recordingIndicator.classList.remove("active");
    audioPlayer.style.display = "block";

    // Stop the MediaStream tracks if we have it
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }

    // stop animation
    if (animationId) cancelAnimationFrame(animationId);

    // close audio context
    if (audioContext && audioContext.state !== "closed") {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
  }

  function playRecording() {
    if (audioPlayer) audioPlayer.play();
  }

  function drawEmptyGraph() {
    if (!graphCtx || !graphCanvas) return;
    const width = graphCanvas.width / (window.devicePixelRatio || 1);
    const height = graphCanvas.height / (window.devicePixelRatio || 1);

    graphCtx.clearRect(0, 0, width, height);

    graphCtx.strokeStyle = "#555";
    graphCtx.lineWidth = 1;
    graphCtx.beginPath();
    graphCtx.moveTo(50, 20);
    graphCtx.lineTo(50, height - 30);
    graphCtx.lineTo(width - 20, height - 30);
    graphCtx.stroke();

    graphCtx.fillStyle = "#999";
    graphCtx.font = "14px Arial";
    graphCtx.textAlign = "center";
    graphCtx.fillText("Frequency (Hz)", width / 2, height - 5);

    graphCtx.save();
    graphCtx.translate(15, height / 2);
    graphCtx.rotate(-Math.PI / 2);
    graphCtx.fillText("Amplitude", 0, 0);
    graphCtx.restore();

    graphCtx.fillStyle = "#fff";
    graphCtx.font = "16px Arial";
    graphCtx.textAlign = "center";
    graphCtx.fillText("Photoacoustic Voice Spectrum", width / 2, 15);

    graphCtx.fillStyle = "#666";
    graphCtx.font = "18px Arial";
    graphCtx.fillText("Record voice to see analysis", width / 2, height / 2);
  }

  function drawRealTimeGraph() {
    if (!analyser || !graphCtx || !graphCanvas) return;

    const width = graphCanvas.width / (window.devicePixelRatio || 1);
    const height = graphCanvas.height / (window.devicePixelRatio || 1);

    function draw() {
      if (!analyser) return;
      analyser.getByteFrequencyData(dataArray);

      graphCtx.fillStyle = "rgba(10, 10, 10, 0.8)";
      graphCtx.fillRect(0, 0, width, height);

      // axes
      graphCtx.strokeStyle = "#555";
      graphCtx.lineWidth = 1;
      graphCtx.beginPath();
      graphCtx.moveTo(50, 20);
      graphCtx.lineTo(50, height - 30);
      graphCtx.lineTo(width - 20, height - 30);
      graphCtx.stroke();

      graphCtx.fillStyle = "#999";
      graphCtx.font = "14px Arial";
      graphCtx.textAlign = "center";
      graphCtx.fillText("Frequency (Hz)", width / 2, height - 5);

      graphCtx.save();
      graphCtx.translate(15, height / 2);
      graphCtx.rotate(-Math.PI / 2);
      graphCtx.fillText("Amplitude", 0, 0);
      graphCtx.restore();

      graphCtx.fillStyle = "#fff";
      graphCtx.font = "16px Arial";
      graphCtx.textAlign = "center";
      graphCtx.fillText("Real-time Voice Spectrum (Recording)", width / 2, 15);

      // draw frequency bars
      const barWidth = (width - 70) / dataArray.length;
      graphCtx.fillStyle = "rgba(255, 215, 0, 0.7)";

      for (let i = 0; i < dataArray.length; i++) {
        const barHeight = (dataArray[i] / 255) * (height - 60);
        graphCtx.fillRect(50 + i * barWidth, height - 30 - barHeight, Math.max(1, barWidth - 1), barHeight);
      }

      if (mediaRecorder && mediaRecorder.state === "recording") {
        animationId = requestAnimationFrame(draw);
      }
    }

    animationId = requestAnimationFrame(draw);
  }

  function drawPhotoacousticGraphFromRecording(result) {
    if (!graphCtx || !graphCanvas) return;

    const width = graphCanvas.width / (window.devicePixelRatio || 1);
    const height = graphCanvas.height / (window.devicePixelRatio || 1);

    // clear
    graphCtx.fillStyle = "rgba(10, 10, 10, 0.8)";
    graphCtx.fillRect(0, 0, width, height);

    // axes
    graphCtx.strokeStyle = "#555";
    graphCtx.lineWidth = 1;
    graphCtx.beginPath();
    graphCtx.moveTo(50, 20);
    graphCtx.lineTo(50, height - 30);
    graphCtx.lineTo(width - 20, height - 30);
    graphCtx.stroke();

    graphCtx.fillStyle = "#999";
    graphCtx.font = "14px Arial";
    graphCtx.textAlign = "center";
    graphCtx.fillText("Frequency (Hz)", width / 2, height - 5);

    graphCtx.save();
    graphCtx.translate(15, height / 2);
    graphCtx.rotate(-Math.PI / 2);
    graphCtx.fillText("Amplitude", 0, 0);
    graphCtx.restore();

    graphCtx.fillStyle = "#fff";
    graphCtx.font = "16px Arial";
    graphCtx.textAlign = "center";
    graphCtx.fillText("Photoacoustic Voice Spectrum Analysis", width / 2, 15);

    // synthetic waveform
    const dataPoints = 500;
    const frequencies = [];
    const amplitudes = [];

    for (let i = 0; i < dataPoints; i++) {
      const x = (i / dataPoints) * (width - 70) + 50;
      const freq = (i / dataPoints) * 5000;
      let amplitude = 0;
      amplitude += Math.sin(2 * Math.PI * freq * 0.001) * 0.8;
      amplitude +=


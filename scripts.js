// Simple page navigation
document.addEventListener("DOMContentLoaded", function () {
  const navLinks = document.querySelectorAll(".nav-link, .mobile-nav-link");
  const pages = document.querySelectorAll(".page");
  const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
  const mobileNavLinks = document.getElementById("mobile-nav-links");
  const voiceDemoBtn = document.getElementById("voice-demo-btn");

  // Function to handle navigation
  function handleNavigation(e) {
    e.preventDefault();

    // Remove active class from all links and pages
    navLinks.forEach((nav) => nav.classList.remove("active"));
    pages.forEach((page) => page.classList.remove("active"));

    // Add active class to clicked link
    this.classList.add("active");

    // Show the corresponding page
    const pageId = this.getAttribute("data-page") + "-page";
    document.getElementById(pageId).classList.add("active");
    // If voice page is shown, resize canvas and redraw
    if (pageId === "voice-page") {
      if (typeof updateCanvasSize === "function") {
        updateCanvasSize();
        drawEmptyGraph();
      }
    }

    // Close mobile menu if open
    mobileNavLinks.classList.remove("active");

    // Scroll to top when switching pages
    window.scrollTo(0, 0);
  }

  // Add click event to all navigation links
  navLinks.forEach((link) => {
    link.addEventListener("click", handleNavigation);
  });

  // Voice demo button navigation
  voiceDemoBtn.addEventListener("click", function (e) {
    e.preventDefault();

    // Remove active class from all links and pages
    navLinks.forEach((nav) => nav.classList.remove("active"));
    pages.forEach((page) => page.classList.remove("active"));

    // Show voice page
    document.getElementById("voice-page").classList.add("active");
    // Resize canvas and redraw when opening voice page via demo button
    if (typeof updateCanvasSize === "function") {
      updateCanvasSize();
      drawEmptyGraph();
    }

    // Close mobile menu if open
    mobileNavLinks.classList.remove("active");

    // Scroll to top
    window.scrollTo(0, 0);
  });

  // Mobile menu toggle
  mobileMenuToggle.addEventListener("click", function () {
    mobileNavLinks.classList.toggle("active");
  });

  // Close mobile menu when clicking outside
  document.addEventListener("click", function (e) {
    if (
      !e.target.closest(".header-content") &&
      !e.target.closest(".mobile-nav-links")
    ) {
      mobileNavLinks.classList.remove("active");
    }
  });

  // Voice recording functionality
  const recordBtn = document.getElementById("record-btn");
  const stopBtn = document.getElementById("stop-btn");
  const playBtn = document.getElementById("play-btn");
  const recordingIndicator = document.getElementById("recording-indicator");
  const audioPlayer = document.getElementById("audio-player");
  const analysisResult = document.getElementById("analysis-result");
  const graphCanvas = document.getElementById("voice-graph");
  const statusEl = document.getElementById("status");
  const spinnerEl = document.getElementById("spinner");
  const resultEl = document.getElementById("result");

  let mediaRecorder;
  let audioChunks = [];
  let audioContext;
  let analyser;
  let dataArray;
  let graphCtx;
  let animationId;
  let currentStream = null;
  let updateCanvasSize = null;
  // Playback analyser for drawing recorded audio spectrum
  let playbackAudioContext = null;
  let playbackAnalyser = null;
  let playbackDataArray = null;
  let playbackSource = null;
  let playbackAnimationId = null;
  // Decoded audio buffer and cached peaks for full-waveform drawing
  let decodedAudioBuffer = null;
  let fullWaveformPeaks = null; // [{min, max}, ...] per pixel column
  let fullWaveformSampleRate = 0;
  // Track current graph state
  let currentGraphState = "empty"; // "empty", "recording", "full-waveform", "playback"

  // Initialize graph
  if (graphCanvas) {
    // Defer sizing until the page (voice) is visible. Provide a resize helper.
    updateCanvasSize = function () {
      if (!graphCanvas) return;
      const rect = graphCanvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      // Set canvas pixel size taking DPR into account
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (graphCanvas.width !== width || graphCanvas.height !== height) {
        graphCanvas.width = width;
        graphCanvas.height = height;
      }
      graphCtx = graphCanvas.getContext("2d");
      // Reset transform and scale to device pixel ratio for crisp drawing
      graphCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // Draw initial empty graph if the canvas is already visible
    updateCanvasSize();
    drawEmptyGraph();

    // Update on window resize
    window.addEventListener("resize", () => {
      updateCanvasSize();
      // Redraw based on current state
      if (currentGraphState === "empty") {
        drawEmptyGraph();
      } else if (currentGraphState === "full-waveform") {
        drawFullWaveform();
      } else if (currentGraphState === "recording") {
        // Will be redrawn by animation loop
      } else if (currentGraphState === "playback") {
        // Will be redrawn by animation loop
      }
    });
  }

  // Check if browser supports media recording
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    recordBtn.addEventListener("click", startRecording);
    stopBtn.addEventListener("click", stopRecording);
    playBtn.addEventListener("click", playRecording);
  } else {
    recordBtn.disabled = true;
    recordBtn.innerHTML =
      '<i class="fas fa-microphone-slash"></i> Recording Not Supported';
  }

  function startRecording() {
    currentGraphState = "recording";
    clearGraph();
    drawRealTimeGraph();

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        // Save the stream so we can stop it reliably later
        currentStream = stream;

        // Choose a supported MIME type for MediaRecorder if possible
        function getSupportedMimeType() {
          const candidates = [
            "audio/webm;codecs=opus",
            "audio/ogg;codecs=opus",
            "audio/webm",
            "audio/ogg",
          ];
          for (const m of candidates) {
            if (
              MediaRecorder.isTypeSupported &&
              MediaRecorder.isTypeSupported(m)
            )
              return m;
          }
          return "";
        }

        const mimeType = getSupportedMimeType();
        mediaRecorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
        // Set up audio context for analysis
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 2048;
        // For time-domain waveform drawing we need the full fftSize buffer
        dataArray = new Uint8Array(analyser.fftSize);

        // Set up media recorder
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
          // Only push non-empty chunks
          if (event.data && event.data.size > 0) {
            audioChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          if (!audioChunks.length) {
            alert("No audio data was captured. Please try again.");
            return;
          }

          // Use the actual mime type of the chunks if available
          const firstType =
            audioChunks[0] && audioChunks[0].type
              ? audioChunks[0].type
              : mediaRecorder.mimeType || "audio/webm";
          const audioBlob = new Blob(audioChunks, { type: firstType });
          const audioUrl = URL.createObjectURL(audioBlob);
          audioPlayer.src = audioUrl;
          playBtn.disabled = false;

          // Decode audio for precise waveform drawing (async)
          (async () => {
            try {
              const tmpCtx = new (window.AudioContext ||
                window.webkitAudioContext)();
              const arrayBuffer = await audioBlob.arrayBuffer();
              const decoded = await tmpCtx.decodeAudioData(arrayBuffer);
              decodedAudioBuffer = decoded;
              fullWaveformSampleRate = decoded.sampleRate;

              // Precompute peaks for current canvas width to speed drawing
              if (typeof updateCanvasSize === "function") updateCanvasSize();
              const width = graphCanvas
                ? Math.max(
                    1,
                    Math.floor(graphCanvas.getBoundingClientRect().width)
                  )
                : 800;
              fullWaveformPeaks = computePeaksForWidth(
                decoded,
                Math.max(1, width - 70)
              );
              // Draw the full waveform now that we have decoded data
              drawFullWaveform();
              try {
                await tmpCtx.close();
              } catch (e) {
                /* ignore */
              }
            } catch (err) {
              console.warn("Failed to decode audio for waveform:", err);
            }
          })();

          // Show analysis result area and start upload to server for analysis
          analysisResult.style.display = "block";
          if (statusEl) statusEl.innerText = "Processing audio...";
          if (spinnerEl) spinnerEl.style.display = "inline-block";

          // Send recorded audio to backend predict endpoint
          (async function uploadAndPredict() {
            try {
              const resultBox = document.getElementById("analysis-result");
              const resultValueEl = resultBox.querySelector(".result-value");
              const resultNoteEl = resultBox.querySelector(".result-note");

              // Show loading state
              resultBox.style.display = "block";
              resultValueEl.textContent = "Analyzing…";
              resultValueEl.style.color = "var(--text-muted)";
              resultNoteEl.textContent =
                "Please wait while we analyze your voice recording.";

              if (spinnerEl) spinnerEl.style.display = "block";
              if (statusEl) statusEl.innerText = "Analyzing audio...";

              // Send audio
              const formData = new FormData();
              formData.append("file", audioBlob, "recording.webm");

              const resp = await fetch(
                "https://pragnaai.onrender.com/predict",
                {
                  method: "POST",
                  body: formData,
                }
              );

              if (!resp.ok) throw new Error("Server returned " + resp.status);

              const data = await resp.json();

              console.log("data.score", data.score);
              console.log("data.label", data.label);

              const percentage = (data.score * 100).toFixed(1);

              resultValueEl.textContent = `${percentage}%`;

              const normalized = (data.label || "").trim().toLowerCase();
              let note = "";

              if (normalized === "likely") {
                resultValueEl.style.color = "red";
                note =
                  "Your voice analysis indicates a higher likelihood of Parkinson's-related vocal biomarkers. Please consult a medical professional.";
              } else if (normalized === "moderate") {
                resultValueEl.style.color = "orange";
                note =
                  "Your voice analysis indicates a moderate presence of vocal biomarkers associated with Parkinson's. Further evaluation is recommended.";
              } else if (normalized === "unlikely") {
                resultValueEl.style.color = "green";
                note =
                  "Your voice analysis indicates no significant vocal biomarkers related to Parkinson's disease.";
              } else {
                resultValueEl.style.color = "green";
                note =
                  "Your voice analysis does not show significant indicators.";
              }

              resultNoteEl.textContent = note;

              if (statusEl) statusEl.innerText = "Done!";
            } catch (err) {
              console.error("Error uploading audio:", err);

              const resultBox = document.getElementById("analysis-result");
              const resultValueEl = resultBox.querySelector(".result-value");
              const resultNoteEl = resultBox.querySelector(".result-note");

              resultValueEl.textContent = "Error";
              resultValueEl.style.color = "red";
              resultNoteEl.textContent =
                "There was a problem analyzing your audio.";

              if (statusEl) statusEl.innerText = "Error!";
            } finally {
              if (spinnerEl) spinnerEl.style.display = "none";
            }
          })();
        };

        mediaRecorder.start();
        recordBtn.disabled = true;
        stopBtn.disabled = false;
        recordingIndicator.classList.add("active");
        audioPlayer.style.display = "none";

        // Ensure canvas is sized and start drawing real-time graph while recording
        if (typeof updateCanvasSize === "function") updateCanvasSize();
        currentGraphState = "recording";
        drawRealTimeGraph();
      })
      .catch((err) => {
        console.error("Error accessing microphone:", err);
        alert(
          "Unable to access your microphone. Please check your permissions and try again."
        );
      });
  }

  function stopRecording() {
    currentGraphState = "full-waveform";
    clearGraph();

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
      recordBtn.disabled = false;
      stopBtn.disabled = true;
      recordingIndicator.classList.remove("active");
      audioPlayer.style.display = "block";

      // Stop saved stream tracks (more reliable across browsers)
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
        currentStream = null;
      } else if (mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());
      }

      // Stop real-time graph animation
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }

      // Close audio context
      if (audioContext) {
        audioContext.close();
        audioContext = null;
      }

      // Update graph state - will be updated to "full-waveform" when decoding completes
      currentGraphState = "full-waveform";
    }
  }

  function playRecording() {
    currentGraphState = "playback";
    clearGraph();

    // Use the playback analysis routine so user gesture both plays and starts analyser
    startPlaybackAnalysis();
  }

  // Start playback + analysis on user gesture (avoids autoplay restrictions)
  function startPlaybackAnalysis() {
    if (!audioPlayer || !audioPlayer.src) {
      alert("No recording available to analyse.");
      return;
    }

    // Clean up any previous playback analyser
    if (playbackAnimationId) {
      cancelAnimationFrame(playbackAnimationId);
      playbackAnimationId = null;
    }
    if (playbackAudioContext) {
      try {
        playbackAudioContext.close();
      } catch (e) {
        /* ignore */
      }
      playbackAudioContext = null;
    }

    try {
      if (typeof updateCanvasSize === "function") updateCanvasSize();
      playbackAudioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      playbackSource =
        playbackAudioContext.createMediaElementSource(audioPlayer);
      playbackAnalyser = playbackAudioContext.createAnalyser();
      playbackAnalyser.fftSize = 2048;
      // Use time-domain buffer for waveform drawing during playback
      playbackDataArray = new Uint8Array(playbackAnalyser.fftSize);
      playbackSource.connect(playbackAnalyser);
      playbackAnalyser.connect(playbackAudioContext.destination);

      const wasMuted = audioPlayer.muted;
      audioPlayer.muted = true;

      // Play the audio (user gesture required) and start analysis loop
      audioPlayer
        .play()
        .then(() => {
          currentGraphState = "playback";

          function drawPlaybackWaveform() {
            if (!graphCtx) return;

            const width =
              graphCanvas.clientWidth ||
              graphCanvas.getBoundingClientRect().width;
            const height =
              graphCanvas.clientHeight ||
              graphCanvas.getBoundingClientRect().height;

            // Clear canvas
            graphCtx.fillStyle = "rgba(10, 10, 10, 0.8)";
            graphCtx.fillRect(0, 0, width, height);

            // Draw title
            graphCtx.fillStyle = "#fff";
            graphCtx.font = "16px Arial";
            graphCtx.textAlign = "center";
            graphCtx.fillText("Voice Waveform (Playback)", width / 2, 15);

            const centerY = (height - 50) / 2 + 20;

            // If we have decoded audio, draw a 1-second window around currentTime
            if (decodedAudioBuffer && decodedAudioBuffer.length) {
              const sr =
                decodedAudioBuffer.sampleRate ||
                fullWaveformSampleRate ||
                48000;
              const channelData =
                decodedAudioBuffer.numberOfChannels > 0
                  ? decodedAudioBuffer.getChannelData(0)
                  : null;
              if (channelData) {
                const winSec = 1.0; // 1 second window
                const curTime = Math.max(
                  0,
                  Math.min(
                    audioPlayer.currentTime || 0,
                    audioPlayer.duration || 0
                  )
                );
                const startSample = Math.max(0, Math.floor(curTime * sr));
                const halfWin = Math.floor((winSec * sr) / 2);
                const s = Math.max(0, startSample - halfWin);
                const e = Math.min(
                  channelData.length,
                  s + Math.floor(winSec * sr)
                );
                const sampleCount = e - s;
                const pixelCount = Math.max(1, Math.floor(width - 70));
                const sliceWidth = (width - 70) / pixelCount;

                graphCtx.lineWidth = 2;
                graphCtx.strokeStyle = "rgba(255, 215, 0, 0.95)";
                graphCtx.beginPath();
                for (let i = 0; i < pixelCount; i++) {
                  const idx = s + Math.floor((i / pixelCount) * sampleCount);
                  const v = channelData[idx] || 0;
                  const x = 50 + i * sliceWidth;
                  const y = centerY - (v * (height - 80)) / 2;
                  if (i === 0) graphCtx.moveTo(x, y);
                  else graphCtx.lineTo(x, y);
                }
                graphCtx.stroke();
              }
            } else if (playbackAnalyser) {
              // Fallback: use analyser time-domain buffer
              playbackAnalyser.getByteTimeDomainData(playbackDataArray);
              const sliceWidth = (width - 70) / playbackDataArray.length;
              graphCtx.lineWidth = 2;
              graphCtx.strokeStyle = "rgba(255, 215, 0, 0.95)";
              graphCtx.beginPath();
              for (let i = 0; i < playbackDataArray.length; i++) {
                const v = (playbackDataArray[i] - 128) / 128.0;
                const x = 50 + i * sliceWidth;
                const y = centerY + (v * (height - 80)) / 2;
                if (i === 0) graphCtx.moveTo(x, y);
                else graphCtx.lineTo(x, y);
              }
              graphCtx.stroke();
            }

            if (!audioPlayer.paused && !audioPlayer.ended) {
              playbackAnimationId = requestAnimationFrame(drawPlaybackWaveform);
            } else {
              audioPlayer.muted = wasMuted;
              try {
                if (playbackAudioContext) playbackAudioContext.close();
              } catch (e) {}
              playbackAudioContext = null;
              playbackAnalyser = null;
              playbackDataArray = null;
              playbackSource = null;
              playbackAnimationId = null;
              // Return to full waveform view after playback ends
              currentGraphState = "full-waveform";
              drawFullWaveform();
            }
          }

          playbackAnimationId = requestAnimationFrame(drawPlaybackWaveform);

          audioPlayer.addEventListener("ended", function onEnded() {
            if (playbackAnimationId) cancelAnimationFrame(playbackAnimationId);
            try {
              if (playbackAudioContext) playbackAudioContext.close();
            } catch (e) {}
            audioPlayer.muted = false;
            playbackAudioContext = null;
            playbackAnalyser = null;
            playbackDataArray = null;
            playbackSource = null;
            playbackAnimationId = null;
            // Return to full waveform view after playback ends
            currentGraphState = "full-waveform";
            drawFullWaveform();
            audioPlayer.removeEventListener("ended", onEnded);
          });
        })
        .catch((err) => {
          console.warn("Playback blocked (user gesture required):", err);
          alert(
            'Please click the audio play button first (user gesture required) and then click "Play & Analyse" again.'
          );
        });
    } catch (err) {
      console.error("Error creating playback audio context for analysis:", err);
      drawPhotoacousticGraphFromRecording();
    }
  }

  function drawEmptyGraph() {
    if (!graphCtx) return;

    const width =
      graphCanvas.clientWidth || graphCanvas.getBoundingClientRect().width;
    const height =
      graphCanvas.clientHeight || graphCanvas.getBoundingClientRect().height;

    // Clear canvas
    graphCtx.clearRect(0, 0, width, height);

    // Draw axes
    graphCtx.strokeStyle = "#555";
    graphCtx.lineWidth = 1;
    graphCtx.beginPath();
    graphCtx.moveTo(50, 20);
    graphCtx.lineTo(50, height - 30);
    graphCtx.lineTo(width - 20, height - 30);
    graphCtx.stroke();

    // Draw labels
    graphCtx.fillStyle = "#999";
    graphCtx.font = "14px Arial";
    graphCtx.textAlign = "center";
    graphCtx.fillText("Time", width / 2, height - 5);
    graphCtx.save();
    graphCtx.translate(15, height / 2);
    graphCtx.rotate(-Math.PI / 2);
    graphCtx.fillText("Amplitude", 0, 0);
    graphCtx.restore();

    // Draw title
    graphCtx.fillStyle = "#fff";
    graphCtx.font = "16px Arial";
    graphCtx.textAlign = "center";
    graphCtx.fillText("Voice Waveform", width / 2, 15);

    // Draw "No Data" message
    graphCtx.fillStyle = "#666";
    graphCtx.font = "18px Arial";
    graphCtx.fillText("Record voice to see analysis", width / 2, height / 2);

    currentGraphState = "empty";
  }

  function drawRealTimeGraph() {
    if (!analyser || !graphCtx) return;

    const width =
      graphCanvas.clientWidth || graphCanvas.getBoundingClientRect().width;
    const height =
      graphCanvas.clientHeight || graphCanvas.getBoundingClientRect().height;

    function draw() {
      if (!analyser) return;

      // Read time-domain waveform
      analyser.getByteTimeDomainData(dataArray);

      // Clear canvas
      graphCtx.fillStyle = "rgba(10, 10, 10, 0.8)";
      graphCtx.fillRect(0, 0, width, height);

      // Draw title
      graphCtx.fillStyle = "#fff";
      graphCtx.font = "16px Arial";
      graphCtx.textAlign = "center";
      graphCtx.fillText("Real-time Voice Waveform (Recording)", width / 2, 15);

      // Draw waveform
      graphCtx.lineWidth = 2;
      graphCtx.strokeStyle = "rgba(255, 215, 0, 0.9)";
      graphCtx.beginPath();

      const sliceWidth = (width - 70) / dataArray.length;
      const centerY = (height - 50) / 2 + 20;
      for (let i = 0; i < dataArray.length; i++) {
        const v = (dataArray[i] - 128) / 128.0;
        const x = 50 + i * sliceWidth;
        const y = centerY + (v * (height - 80)) / 2;
        if (i === 0) graphCtx.moveTo(x, y);
        else graphCtx.lineTo(x, y);
      }
      graphCtx.stroke();

      // Fill under curve
      graphCtx.fillStyle = "rgba(255, 215, 0, 0.12)";
      graphCtx.lineTo(
        50 + (dataArray.length - 1) * sliceWidth,
        centerY + (height - 80) / 2
      );
      graphCtx.lineTo(50, centerY + (height - 80) / 2);
      graphCtx.closePath();
      graphCtx.fill();

      // Continue animation if still recording
      if (mediaRecorder && mediaRecorder.state === "recording") {
        animationId = requestAnimationFrame(draw);
      }
    }

    animationId = requestAnimationFrame(draw);
  }

  function drawFullWaveform() {
    if (!graphCtx) return;
    if (!decodedAudioBuffer && !fullWaveformPeaks) {
      drawPhotoacousticGraphFromRecording();
      return;
    }

    const width =
      graphCanvas.clientWidth || graphCanvas.getBoundingClientRect().width;
    const height =
      graphCanvas.clientHeight || graphCanvas.getBoundingClientRect().height;

    graphCtx.fillStyle = "rgba(10, 10, 10, 0.8)";
    graphCtx.fillRect(0, 0, width, height);

    graphCtx.fillStyle = "#fff";
    graphCtx.font = "16px Arial";
    graphCtx.textAlign = "center";
    graphCtx.fillText("Recorded Voice Waveform", width / 2, 15);

    const pixelWidth = Math.max(1, Math.floor(width - 70));
    let peaks = fullWaveformPeaks;
    if (!peaks && decodedAudioBuffer) {
      peaks = computePeaksForWidth(decodedAudioBuffer, pixelWidth);
      fullWaveformPeaks = peaks;
    }

    if (!peaks || !peaks.length) return;

    const centerY = (height - 50) / 2 + 20;
    const sliceWidth = (width - 70) / peaks.length;

    graphCtx.beginPath();
    graphCtx.lineWidth = 1.5;
    graphCtx.strokeStyle = "rgba(255, 215, 0, 0.95)";
    for (let i = 0; i < peaks.length; i++) {
      const p = peaks[i];
      const x = 50 + i * sliceWidth;
      const yTop = centerY + (-p.max * (height - 80)) / 2;
      const yBottom = centerY + (-p.min * (height - 80)) / 2;
      // draw vertical line for min->max
      graphCtx.moveTo(x, yTop);
      graphCtx.lineTo(x, yBottom);
    }
    graphCtx.stroke();

    currentGraphState = "full-waveform";
  }

  function drawPhotoacousticGraphFromRecording() {
    if (!graphCtx) return;

    const width =
      graphCanvas.clientWidth || graphCanvas.getBoundingClientRect().width;
    const height =
      graphCanvas.clientHeight || graphCanvas.getBoundingClientRect().height;
    // Clear canvas
    graphCtx.fillStyle = "rgba(10, 10, 10, 0.8)";
    graphCtx.fillRect(0, 0, width, height);

    // Draw title
    graphCtx.fillStyle = "#fff";
    graphCtx.font = "16px Arial";
    graphCtx.textAlign = "center";
    graphCtx.fillText("Voice Waveform", width / 2, 15);

    // Draw a simulated time-domain waveform (sum of harmonics) as a sine-like graph
    const dataPoints = 1024;
    const sliceWidth = (width - 70) / dataPoints;
    const centerY = (height - 50) / 2 + 20;

    graphCtx.lineWidth = 2;
    graphCtx.strokeStyle = "rgba(255, 215, 0, 0.9)";
    graphCtx.beginPath();

    const baseFreq = 2.5; // visual cycles across the canvas
    for (let i = 0; i < dataPoints; i++) {
      const t = i / dataPoints;
      // Create a complex waveform by summing a few harmonics
      let v = Math.sin(2 * Math.PI * baseFreq * t) * 0.8;
      v += Math.sin(2 * Math.PI * baseFreq * 2 * t + 0.5) * 0.4;
      v += Math.sin(2 * Math.PI * baseFreq * 3 * t + 1.2) * 0.25;
      v += (Math.random() - 0.5) * 0.05; // light noise

      const x = 50 + i * sliceWidth;
      const y = centerY + (v * (height - 80)) / 2;
      if (i === 0) graphCtx.moveTo(x, y);
      else graphCtx.lineTo(x, y);
    }
    graphCtx.stroke();

    // Fill under curve
    graphCtx.fillStyle = "rgba(255, 215, 0, 0.12)";
    graphCtx.lineTo(
      50 + (dataPoints - 1) * sliceWidth,
      centerY + (height - 80) / 2
    );
    graphCtx.lineTo(50, centerY + (height - 80) / 2);
    graphCtx.closePath();
    graphCtx.fill();

    currentGraphState = "full-waveform";
  }

  function clearGraph() {
    if (!graphCtx || !graphCanvas) return;
    const width =
      graphCanvas.clientWidth || graphCanvas.getBoundingClientRect().width;
    const height =
      graphCanvas.clientHeight || graphCanvas.getBoundingClientRect().height;
    graphCtx.clearRect(0, 0, width, height);
  }

  // Utility: compute per-column peaks (min/max) for a decoded AudioBuffer
  function computePeaksForWidth(audioBuffer, pixelWidth) {
    if (!audioBuffer || !audioBuffer.length) return null;
    const channelData =
      audioBuffer.numberOfChannels > 0 ? audioBuffer.getChannelData(0) : null;
    if (!channelData) return null;
    const samplesPerPixel = Math.max(
      1,
      Math.floor(channelData.length / pixelWidth)
    );
    const peaks = new Array(pixelWidth);
    for (let i = 0; i < pixelWidth; i++) {
      const start = i * samplesPerPixel;
      const end = Math.min(channelData.length, start + samplesPerPixel);
      let min = 1.0,
        max = -1.0;
      for (let s = start; s < end; s++) {
        const v = channelData[s];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      peaks[i] = { min, max };
    }
    return peaks;
  }
});

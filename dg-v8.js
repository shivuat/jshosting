(async function () {
  // Create and style the controls div
  const controlsDiv = document.createElement('div');
  controlsDiv.id = 'controls';
  controlsDiv.style = 'position: fixed; top: 10px; right: 10px; z-index: 9999; background-color: white; padding: 10px; border: 1px solid black; border-radius: 5px;';
  document.body.appendChild(controlsDiv);

  // Create and style the start button
  const startButton = document.createElement('button');
  startButton.id = 'startButton';
  startButton.innerText = 'Start Recording';
  startButton.style = 'margin-right: 5px; padding: 5px 10px; background-color: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer;';
  controlsDiv.appendChild(startButton);

  // Create and style the stop button
  const stopButton = document.createElement('button');
  stopButton.id = 'stopButton';
  stopButton.innerText = 'Stop Recording';
  stopButton.style = 'margin-right: 5px; padding: 5px 10px; background-color: #f44336; color: white; border: none; border-radius: 3px; cursor: pointer;';
  stopButton.disabled = true;
  controlsDiv.appendChild(stopButton);

  // Create and style the status div
  const statusDiv = document.createElement('div');
  statusDiv.id = 'status';
  statusDiv.innerText = 'Status: Not Connected';
  statusDiv.style = 'margin-top: 10px; padding: 5px; background-color: lightgray;';
  controlsDiv.appendChild(statusDiv);

  // Create and style the transcript div
  const transcriptDiv = document.createElement('div');
  transcriptDiv.id = 'transcript';
  transcriptDiv.style = 'margin-top: 10px; white-space: pre-wrap; word-wrap: break-word; height: 400px; max-height: 1400px; width: 1000px; overflow-y: scroll; border: 1px solid black; padding: 5px;';
  controlsDiv.appendChild(transcriptDiv);

  // Create and style the results div
  const resultsDiv = document.createElement('div');
  resultsDiv.id = 'results';
  resultsDiv.style = 'margin-top: 10px; padding: 5px;';
  controlsDiv.appendChild(resultsDiv);

  // Create and style the waveform canvas
  const canvas = document.createElement('canvas');
  canvas.id = 'waveform';
  canvas.width = 1000;
  canvas.height = 100;
  canvas.style = 'margin-top: 10px; border: 1px solid black;';
  controlsDiv.appendChild(canvas);

  // JavaScript for handling recording, WebSocket connection, and waveform visualization
  let mediaRecorder;
  let socket;
  let fullTranscript = '';
  let audioContext;
  let analyser;
  let dataArray;
  let bufferLength;
  let canvasContext;

  async function startRecording() {
    updateStatus('Connecting...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      initializeAudioContext(stream);
      initializeMediaRecorder(stream);
      initializeWebSocket();
    } catch (error) {
      handleError('Error accessing media devices', error);
    }
  }

  function initializeAudioContext(stream) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 2048;
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    canvasContext = canvas.getContext('2d');
  }

  function initializeMediaRecorder(stream) {
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorder.ondataavailable = handleDataAvailable;
    mediaRecorder.start(1000);
    toggleButtons(true);
    drawWaveform();
  }

  function initializeWebSocket() {
    socket = new WebSocket('wss://api.deepgram.com/v1/listen?diarize=true&smart_format=true&redact=pci&redact=ssn&model=nova-2', ['token', 'bf373551459bce132cef3b1b065859ed3e4bac8f']);
    socket.onopen = () => updateStatus('Connected');
    socket.onmessage = handleSocketMessage;
    socket.onclose = () => updateStatus('Disconnected');
    socket.onerror = (error) => handleError('WebSocket error', error);
  }

  function handleDataAvailable(event) {
    if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
      socket.send(event.data);
    }
  }

  function handleSocketMessage(message) {
    const received = JSON.parse(message.data);
    const transcript = received.channel.alternatives[0].transcript;
    const words = received.channel.alternatives[0].words;

    if (transcript && received.is_final) {
      updateTranscript(words);
    }
  }

  function updateTranscript(words) {
    let transcriptText = '';
    let currentSpeaker = null;
    words.forEach(word => {
      if (word.speaker !== currentSpeaker) {
        if (currentSpeaker !== null) {
          transcriptText += '\n';
        }
        currentSpeaker = word.speaker;
        transcriptText += `[Speaker ${currentSpeaker}] `;
      }
      transcriptText += `${word.punctuated_word} `;
    });
    fullTranscript += transcriptText.trim() + '\n';
    transcriptDiv.textContent += transcriptText.trim() + '\n';
  }

  function stopRecording() {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    socket.close();
    toggleButtons(false);
    updateStatus('Not Connected');
    promptForApiKey();
  }

  function toggleButtons(isRecording) {
    startButton.disabled = isRecording;
    stopButton.disabled = !isRecording;
  }

  function updateStatus(status) {
    statusDiv.textContent = `Status: ${status}`;
  }

  function handleError(message, error) {
    updateStatus('Error');
    console.error(message, error);
  }

  function promptForApiKey() {
    const promptDiv = document.createElement('div');
    promptDiv.id = 'prompt';
    promptDiv.style = 'margin-top: 10px; padding: 5px; border: 1px solid black; border-radius: 3px;';
    promptDiv.innerHTML = `
      <label for="apiKeyInput">Enter OpenAI API Key:</label>
      <input type="text" id="apiKeyInput" placeholder="API Key" style="margin-left: 5px; padding: 5px; border: 1px solid black; border-radius: 3px;">
      <button id="proceedButton" style="margin-left: 5px; padding: 5px 10px; background-color: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer;">Proceed</button>
    `;
    resultsDiv.appendChild(promptDiv);
    document.getElementById('proceedButton').addEventListener('click', async () => {
      const apiKey = document.getElementById('apiKeyInput').value;
      if (!apiKey) {
        alert('Please enter the OpenAI API key');
        return;
      }
      const analysisResults = await callOpenAiAPI(fullTranscript, apiKey);
      displayResults(analysisResults);
      promptDiv.remove();
    });
  }

  async function callOpenAiAPI(transcript, apiKey) {
    const maxLength = 4096;
    if (transcript.length > maxLength) {
      transcript = transcript.substring(0, maxLength);
    }

    try {
      const summary = await callOpenAiEndpoint('Summarize the following conversation:', transcript, apiKey);
      const intent = await callOpenAiEndpoint('Identify the intent of the following conversation:', transcript, apiKey);
      return { summary, intent };
    } catch (error) {
      handleError('Error during OpenAI API calls', error);
      return { error: 'Error during OpenAI API calls: ' + error.message };
    }
  }

  async function callOpenAiEndpoint(prompt, transcript, apiKey) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: `${prompt}\n\n${transcript}\n\nResponse:` }
        ],
        max_tokens: 150,
        n: 1,
        stop: ['\n']
      })
    });

    if (!response.ok) {
      const data = await response.json();
      console.error('Fetch failed:', data);
      throw new Error('Fetch failed');
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  }

  function displayResults(analysis) {
    const resultsBox = document.createElement('div');
    resultsBox.style = 'border: 1px solid black; padding: 10px; margin-top: 10px;';
    const resultsTitle = document.createElement('h3');
    resultsTitle.textContent = 'Analysis Results:';
    resultsBox.appendChild(resultsTitle);

    if (analysis.error) {
      const errorContent = document.createElement('p');
      errorContent.textContent = `Error: ${analysis.error}`;
      resultsBox.appendChild(errorContent);
    } else {
      const summaryContent = document.createElement('p');
      summaryContent.textContent = `Summary: ${analysis.summary}`;
      summaryContent.className = 'summary';
      resultsBox.appendChild(summaryContent);

      const intentContent = document.createElement('p');
      intentContent.textContent = `Intent: ${analysis.intent}`;
      intentContent.className = 'intent';
      resultsBox.appendChild(intentContent);
    }

    resultsDiv.appendChild(resultsBox);
  }

  function drawWaveform() {
    requestAnimationFrame(drawWaveform);
    analyser.getByteTimeDomainData(dataArray);
    canvasContext.fillStyle = 'white';
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);
    canvasContext.lineWidth = 2;
    canvasContext.strokeStyle = 'black';
    canvasContext.beginPath();

    const sliceWidth = canvas.width * 1.0 / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = v * canvas.height / 2;

      if (i === 0) {
        canvasContext.moveTo(x, y);
      } else {
        canvasContext.lineTo(x, y);
      }

      x += sliceWidth;
    }

    canvasContext.lineTo(canvas.width, canvas.height / 2);
    canvasContext.stroke();
  }

  startButton.addEventListener('click', startRecording);
  stopButton.addEventListener('click', stopRecording);

  const style = document.createElement('style');
  style.innerHTML = `
    .summary {
      background-color: #e0f7fa;
      padding: 5px;
      border-radius: 5px;
    }
    .intent {
      background-color: #fff3e0;
      padding: 5px;
      border-radius: 5px;
    }
  `;
  document.head.appendChild(style);
})();

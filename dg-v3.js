(function() {
  // Create and style the controls div
  var controlsDiv = document.createElement('div');
  controlsDiv.id = 'controls';
  controlsDiv.style = 'position: fixed; top: 10px; right: 10px; z-index: 9999; background-color: white; padding: 10px; border: 1px solid black; border-radius: 5px;';
  document.body.appendChild(controlsDiv);

  // Create and style the start button
  var startButton = document.createElement('button');
  startButton.id = 'startButton';
  startButton.innerText = 'Start Recording';
  startButton.style = 'margin-right: 5px; padding: 5px 10px; background-color: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer;';
  controlsDiv.appendChild(startButton);

  // Create and style the stop button
  var stopButton = document.createElement('button');
  stopButton.id = 'stopButton';
  stopButton.innerText = 'Stop Recording';
  stopButton.style = 'padding: 5px 10px; background-color: #f44336; color: white; border: none; border-radius: 3px; cursor: pointer;';
  stopButton.disabled = true;
  controlsDiv.appendChild(stopButton);

  // Create and style the status div
  var statusDiv = document.createElement('div');
  statusDiv.id = 'status';
  statusDiv.innerText = 'Status: Not Connected';
  statusDiv.style = 'margin-top: 10px; padding: 5px; background-color: lightgray;';
  controlsDiv.appendChild(statusDiv);

  // Create and style the transcript div
  var transcriptDiv = document.createElement('div');
  transcriptDiv.id = 'transcript';
  transcriptDiv.style = 'margin-top: 10px; white-space: pre-wrap; word-wrap: break-word; height: 400px; max-height: 1400px; width: 1000px; overflow-y: scroll; border: 1px solid black; padding: 5px;';
  controlsDiv.appendChild(transcriptDiv);

  // JavaScript for handling recording and WebSocket connection
  let mediaRecorder;
  let socket;

  function startRecording() {
    statusDiv.textContent = 'Status: Connecting...';
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      socket = new WebSocket('wss://api.deepgram.com/v1/listen?diarize=true&smart_format=true&redact=pci&redact=ssn&model=nova-2', ['token', 'bf373551459bce132cef3b1b065859ed3e4bac8f']);

      socket.onopen = () => {
        statusDiv.textContent = 'Status: Connected';
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === 1) {
            socket.send(event.data);
          }
        };
        mediaRecorder.start(1000);
        startButton.disabled = true;
        stopButton.disabled = false;
      };

      socket.onmessage = (message) => {
        const received = JSON.parse(message.data);
        const transcript = received.channel.alternatives[0].transcript;
        const words = received.channel.alternatives[0].words;

        if (transcript && received.is_final) {
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
          transcriptDiv.textContent += transcriptText.trim() + '\n';
        }
      };

      socket.onclose = () => {
        statusDiv.textContent = 'Status: Disconnected';
      };

      socket.onerror = (error) => {
        statusDiv.textContent = 'Status: Error';
        console.error('WebSocket error:', error);
      };
    }).catch(error => {
      statusDiv.textContent = 'Error accessing media devices';
      console.error('Error accessing media devices:', error);
    });
  }

  function stopRecording() {
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    if (socket) {
      socket.close();
    }
    startButton.disabled = false;
    stopButton.disabled = true;
    statusDiv.textContent = 'Status: Not Connected';
  }

  // Add event listeners to the buttons
  startButton.addEventListener('click', startRecording);
  stopButton.addEventListener('click', stopRecording);
})();

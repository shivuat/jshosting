javascript:(function() {
  
  var controlsDiv = document.createElement('div');
  controlsDiv.id = 'controls';
  controlsDiv.style = 'position: fixed; top: 10px; right: 10px; z-index: 9999; background-color: white; padding: 10px; border: 1px solid black; border-radius: 5px;';
  document.body.appendChild(controlsDiv);


  var startButton = document.createElement('button');
  startButton.id = 'startButton';
  startButton.innerText = 'Start Recording';
  startButton.style = 'margin-right: 5px; padding: 5px 10px; background-color: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer;';
  controlsDiv.appendChild(startButton);

 
  var stopButton = document.createElement('button');
  stopButton.id = 'stopButton';
  stopButton.innerText = 'Stop Recording';
  stopButton.style = 'padding: 5px 10px; background-color: #f44336; color: white; border: none; border-radius: 3px; cursor: pointer;';
  stopButton.disabled = true;
  controlsDiv.appendChild(stopButton);

 
  var statusDiv = document.createElement('div');
  statusDiv.id = 'status';
  statusDiv.innerText = 'Status: Not Connected';
  statusDiv.style = 'margin-top: 10px; padding: 5px; background-color: lightgray;';
  controlsDiv.appendChild(statusDiv);

  
  var transcriptDiv = document.createElement('div');
  transcriptDiv.id = 'transcript';
  transcriptDiv.style = 'margin-top: 10px; white-space: pre-wrap; word-wrap: break-word; max-height: 300px; max-width: 400px; overflow-y: scroll; border: 1px solid black; padding: 5px;';
  controlsDiv.appendChild(transcriptDiv);

  
  let mediaRecorder;
  let socket;

  function adjustTranscriptSize() {
    const lines = transcriptDiv.textContent.split('\n').length;
    transcriptDiv.style.height = Math.min(50 + lines * 20, window.innerHeight - 100) + 'px';
    transcriptDiv.style.width = Math.min(300 + lines * 10, window.innerWidth - 100) + 'px';
  }

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
        if (transcript && received.is_final) {
          transcriptDiv.textContent += transcript + '\n';
          adjustTranscriptSize();
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

 
  startButton.addEventListener('click', startRecording);
  stopButton.addEventListener('click', stopRecording);
})();

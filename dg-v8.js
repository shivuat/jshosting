(async function() {
  // Create and style the mic button
  var micButton = document.createElement('button');
  micButton.id = 'micButton';
  micButton.innerHTML = '🎤';
  micButton.style = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; background-color: #4CAF50; color: white; border: none; border-radius: 50%; width: 30px; height: 30px; font-size: 24px; cursor: pointer;';
  document.body.appendChild(micButton);

  // Create and style the status div
  var statusDiv = document.createElement('div');
  statusDiv.id = 'status';
  statusDiv.style = 'position: fixed; bottom: 100px; right: 20px; z-index: 9999; background-color: white; padding: 10px; border: 1px solid black; border-radius: 5px; display: none;';
  document.body.appendChild(statusDiv);

  // Create and style the transcript div
  var transcriptDiv = document.createElement('div');
  transcriptDiv.id = 'transcript';
  transcriptDiv.style = 'position: fixed; bottom: 150px; right: 20px; z-index: 9999; background-color: white; padding: 10px; border: 1px solid black; border-radius: 5px; max-width: 300px; max-height: 200px; overflow-y: auto; display: none;';
  document.body.appendChild(transcriptDiv);

  // JavaScript for handling recording, WebSocket connection, and displaying transcript
  let mediaRecorder;
  let socket;
  let fullTranscript = '';
  let isRecording = false;

  async function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function startRecording() {
    statusDiv.textContent = 'Recording...';
    statusDiv.style.display = 'block';
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      socket = new WebSocket('wss://api.deepgram.com/v1/listen?diarize=true&smart_format=true&redact=pci&redact=ssn&model=nova-2', ['token', 'bf373551459bce132cef3b1b065859ed3e4bac8f']);

      socket.onopen = () => {
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && socket.readyState === 1) {
            socket.send(event.data);
          }
        };
        mediaRecorder.start(1000);
        isRecording = true;
        micButton.style.backgroundColor = '#f44336';
      };

      socket.onmessage = (message) => {
        const received = JSON.parse(message.data);
        const transcript = received.channel.alternatives[0].transcript;

        if (transcript && received.is_final) {
          fullTranscript += transcript.trim() + '\n';
          transcriptDiv.textContent = transcript.trim();
          transcriptDiv.style.display = 'block';
        }
      };

      socket.onclose = () => {
        console.log('WebSocket closed');
      };

      socket.onerror = (error) => {
        statusDiv.textContent = 'Error: ' + error.message;
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
    statusDiv.textContent = 'Recording stopped';
    micButton.style.backgroundColor = '#4CAF50';
    isRecording = false;

    // Call OpenAI API to get summarization and intent
    callOpenAiAPI(fullTranscript, 'sk-proj-PneN3N8cXYq3hUSlR8fYT3BlbkFJr2RjVqKCvAowxI8C5fm5').then((analysisResults) => {
      displayResults(analysisResults);
    });
  }

  // Function to call OpenAI API
  async function callOpenAiAPI(transcript, apiKey) {
    const maxLength = 4096; // Maximum token length for the model

    // Trim the transcript if it's too long
    if (transcript.length > maxLength) {
      transcript = transcript.substring(0, maxLength);
    }

    try {
      // Summarization
      const summary = await callOpenAiEndpoint('https://api.openai.com/v1/chat/completions', transcript, apiKey, 'Summarize the following conversation:');
      // Intent
      const intent = await callOpenAiEndpoint('https://api.openai.com/v1/chat/completions', transcript, apiKey, 'Identify the intent of the following conversation:');
      
      return {
        summary,
        intent
      };
    } catch (error) {
      console.error('Error during OpenAI API calls:', error);
      return { error: 'Error during OpenAI API calls: ' + error.message };
    }
  }

  // Function to call a specific OpenAI endpoint
  async function callOpenAiEndpoint(url, transcript, apiKey, prompt) {
    const options = {
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
    };

    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) {
      console.error('Fetch failed:', data);
      throw new Error('Fetch failed');
    }
    return data.choices[0].message.content.trim();
  }

  // Function to display results
  function displayResults(analysis) {
    if (analysis.error) {
      transcriptDiv.textContent += `\nError: ${analysis.error}`;
    } else {
      transcriptDiv.textContent += `\nSummary: ${analysis.summary}`;
      transcriptDiv.textContent += `\nIntent: ${analysis.intent}`;
      localStorage.setItem('latestIntent', analysis.intent);
    }
  }

  // Add event listener to the mic button
  micButton.addEventListener('click', toggleRecording);
})();

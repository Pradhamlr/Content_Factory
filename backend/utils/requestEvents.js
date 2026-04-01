const requestStreams = new Map();

function addStream(requestId, res) {
  const streams = requestStreams.get(requestId) || [];
  streams.push(res);
  requestStreams.set(requestId, streams);
}

function removeStream(requestId, res) {
  const streams = requestStreams.get(requestId) || [];
  const nextStreams = streams.filter((stream) => stream !== res);

  if (nextStreams.length) {
    requestStreams.set(requestId, nextStreams);
    return;
  }

  requestStreams.delete(requestId);
}

function publish(requestId, event, payload) {
  const streams = requestStreams.get(requestId) || [];
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  streams.forEach((stream) => stream.write(message));
}

export { addStream, removeStream, publish };

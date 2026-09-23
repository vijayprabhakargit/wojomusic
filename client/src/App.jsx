import React from 'react';
import { useSocket } from './hooks/useSocket';
import Landing from './pages/Landing';
import Room from './pages/Room';

function App() {
  const socket = useSocket();
  const [page, setPage] = React.useState('landing');

  const handleRoomCreated = () => {
    setPage('room');
  };

  const handleRoomJoined = () => {
    setPage('room');
  };

  const handleLeaveRoom = () => {
    socket.leaveRoom();
    setPage('landing');
  };

  if (page === 'room' && socket.roomId) {
    return (
      <Room
        socket={socket}
        onLeave={handleLeaveRoom}
      />
    );
  }

  return (
    <Landing
      socket={socket}
      onRoomCreated={handleRoomCreated}
      onRoomJoined={handleRoomJoined}
    />
  );
}

export default App;

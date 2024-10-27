import './App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import RequireAuth from './RequireAuth'
import Home from './pages/Home'
import Login from './pages/Login'
import Files from './pages/Files'
import MyPage from './pages/MyPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route 
          path="/" 
          element={
            <RequireAuth>
              <Home />
            </RequireAuth>
          } 
        />
        <Route 
          path="/files" 
          element={
            <RequireAuth>
              <Files />
            </RequireAuth>
          } 
        />
        <Route 
          path="/mypage" 
          element={
            <RequireAuth>
              <MyPage />
            </RequireAuth>
          } 
        />
        {/* 다른 라우트들을 여기에 추가할 수 있습니다. */}
      </Routes>
    </BrowserRouter>
  );
}

export default App;

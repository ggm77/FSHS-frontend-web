import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const Login = () => {

    useEffect(() => {
        localStorage.clear();
    }, []);
 
    let navigate = useNavigate();

    const apiUrl = "http://raspinas.iptime.org:8085/api/v1"

     // 이메일과 비밀번호를 위한 상태 password
    const [userEmail, setUserEmail] = useState('');
    const [userPassword, setUserPassword] = useState('');
    const userData = {userEmail,userPassword}

    // 폼 제출 처리
    const handleSubmit = (event) => {
        event.preventDefault(); // 폼 제출 시 페이지 리로드 방지
        // 로그인 로직을 여기에 구현하세요. 예: API 호출

        axios.post(apiUrl + "/auth/sign-in", userData)
            .then(response => {
                console.log('서버 응답:', response.data);
                // 로그인 성공 후 처리 로직 (예: 토큰 저장, 페이지 리디렉션 등)
                axios.defaults.headers.common[
                    "Authorization"
                ] = 'Bearer ' + response.data.accessToken;
                localStorage.setItem('accessToken', response.data.accessToken);
                localStorage.setItem('refreshToken', response.data.refreshToken);
                localStorage.setItem("userId", response.data.id);
                localStorage.setItem("userProfilePictureUrl", response.data.userProfilePictureUrl)
                navigate("/")
            })
            .catch(error => {
                console.error('로그인 요청 실패:', error);
                // 에러 처리 로직
                alert("로그인에 실패했습니다.")
            })
    };

    // 입력 핸들러
    const handleEmailChange = (event) => {
        setUserEmail(event.target.value);
    };

    const handlePasswordChange = (event) => {
        setUserPassword(event.target.value);
    };

    return (
        <div className="login-container">
        <form onSubmit={handleSubmit}>
            <h2>로그인</h2>
            <div className="form-group">
            <label htmlFor="userEmail">이메일:</label>
            <input
                type="text"
                id="userEmail"
                value={userEmail}
                onChange={handleEmailChange}
                required
            />
            </div>
            <div className="form-group">
            <label htmlFor="userPassword">비밀번호:</label>
            <input
                type="password"
                id="userPassword"
                value={userPassword}
                onChange={handlePasswordChange}
                required
            />
            </div>
            <button type="submit">로그인</button>
        </form>
        </div>
    );
}

export default Login;
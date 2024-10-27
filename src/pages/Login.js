import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const Login = () => {

    const apiUrl = process.env.REACT_APP_API_URL;

    useEffect(() => {
        localStorage.clear();
    }, []);
 
    let navigate = useNavigate();

    

     // 이메일과 비밀번호를 위한 상태 password
    const [userName, setUserName] = useState('')
    const [signUpUserEmail, setSignUpUserEamil] = useState('');
    const [signUpUserPassword, setSignUpUserPassword] = useState('');
    const signUpData = {userName, signUpUserEmail, signUpUserPassword}

    const [userEmail, setUserEmail] = useState('');
    const [userPassword, setUserPassword] = useState('');
    const signInData = {userEmail,userPassword}

    // 폼 제출 처리
    const handleSignInSubmit = (event) => {
        event.preventDefault(); // 폼 제출 시 페이지 리로드 방지
        // 로그인 로직을 여기에 구현하세요. 예: API 호출

        axios.post(apiUrl + "/auth/sign-in", signInData)
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

    const handleSignUpSubmit = (event) => {
        event.preventDefault(); // 폼 제출 시 페이지 리로드 방지
        // 로그인 로직을 여기에 구현하세요. 예: API 호출

        axios.post(apiUrl + "/auth/sign-up", signUpData)
            .then(response => {
                console.log('서버 응답:', response.data);
                // 로그인 성공 후 처리 로직 (예: 토큰 저장, 페이지 리디렉션 등)
                alert("회원가입에 성공했습니다. 로그인 해 주세요.")
                navigate("/login")
            })
            .catch(error => {
                console.error('회원가입 요청 실패:', error);
                // 에러 처리 로직
                alert("회원가입에 실패했습니다.")
            })
    };

    // 입력 핸들러
    const handleUserNameChange = (event) => {
        setUserName(event.target.value);
    };

    const handleSignUpUserEmailChange = (event) => {
        setSignUpUserEamil(event.target.value);
    };

    const handleSignUpUserPasswordChange = (event) => {
        setSignUpUserPassword(event.target.value);
    };

    const handleEmailChange = (event) => {
        setUserEmail(event.target.value);
    };

    const handlePasswordChange = (event) => {
        setUserPassword(event.target.value);
    };

    return (
        <div>
            <div className="login-container">
                <form onSubmit={handleSignInSubmit}>
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
            <div>
                <form onSubmit={handleSignUpSubmit}>
                    <h2>회원가입</h2>
                    <div className="form-group">
                    <label htmlFor="userEmail">이름:</label>
                    <input
                        type="text"
                        id="userName"
                        value={userName}
                        onChange={handleUserNameChange}
                        required
                    />
                    </div>
                    <div className="form-group">
                    <label htmlFor="userEmail">이메일:</label>
                    <input
                        type="email"
                        id="userEmail"
                        value={signUpUserEmail}
                        onChange={handleSignUpUserEmailChange}
                        required
                    />
                    </div>
                    <div className="form-group">
                    <label htmlFor="userPassword">비밀번호:</label>
                    <input
                        type="password"
                        id="userPassword"
                        value={signUpUserPassword}
                        onChange={handleSignUpUserPasswordChange}
                        required
                    />
                    </div>
                    <button type="submit">회원가입</button>
                </form>
            </div>
        </div>
        
    );
}

export default Login;
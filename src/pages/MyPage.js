import React, { useState, useEffect } from 'react';
import { useNavigate} from 'react-router-dom';
import axios from 'axios';
import logo from '../assets/logo.png';

const MyPage = () => {

    const apiUrl = process.env.REACT_APP_API_URL;
    const navigate = useNavigate();

    const userId = localStorage.getItem('userId');

    const [id, setId] = useState('');
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [userProfilePictureUrl, setUserProfilePictureUrl] = useState('');
    const [signUpDate, setSignUpDate] = useState('');
    const [admin, setAdmin] = useState(false);
    const [disabled, setDisabled] = useState(false);

    useEffect(() => {
        axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
        axios.get(apiUrl + "/users/" + userId)
            .then(response => {
                console.log(response.data);

                setId(response.data.id);
                setUserName(response.data.userName);
                setUserEmail(response.data.userEmail);
                setUserProfilePictureUrl(response.data.userProfilePictureUrl);
                setSignUpDate(response.data.signUpDate);
                setAdmin(response.data.admin);
                setDisabled(response.data.disabled);
            })
            .catch(error => {
                if (error.response && error.response.status === 403) {
                    axios.post(apiUrl + "/refresh-token", {"refreshToken" : localStorage.getItem("refreshToken")})
                        .then(response => {
                            localStorage.setItem('accessToken', response.data.accessToken);
                            localStorage.setItem('refreshToken', response.data.refreshToken);

                            axios.get(apiUrl + "/users/" + userId)
                                .then(response => {
                                    console.log(response.data);

                                    setId(response.data.id);
                                    setUserName(response.data.userName);
                                    setUserEmail(response.data.userEmail);
                                    setUserProfilePictureUrl(response.data.userProfilePictureUrl);
                                    setSignUpDate(response.data.signUpDate);
                                    setAdmin(response.data.admin);
                                    setDisabled(response.data.disabled);
                                })
                                .catch(error => {
                                    console.error(error);
                                })
                        })
                }
                else{
                    console.error(error);
                }
            })
    }, [])

    const deleteUser = () => {
        if(window.confirm("정말로 탈퇴 하시겠습니까? 저장된 모든 파일과 정보는 삭제 됩니다.")){
            axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
            axios.delete(apiUrl + "/users/" + id)
                .then(response => {
                    console.log(response.data);
                })
                .catch(error => {
                    if (error.response && error.response.status === 403) {
                        axios.post(apiUrl + "/refresh-token", {"refreshToken" : localStorage.getItem("refreshToken")})
                            .then(response => {
                                localStorage.setItem('accessToken', response.data.accessToken);
                                localStorage.setItem('refreshToken', response.data.refreshToken);
    
                                axios.delete(apiUrl + "/users/" + userId)
                                    .then(response => {
                                        console.log(response.data);
                                    })
                                    .catch(error => {
                                        console.error(error);
                                    })
                            })
                    }
                    else{
                        console.error(error);
                    }
                })
            
            alert("탈퇴완료");
            navigate('/login')
        }
    }

    const goToHome = () => {
        navigate('/');
    }

    return (
        <div>
            <div style={{display: 'flex'}}>
                <img src={logo} style={{height: "35px", marginTop: "27px", marginLeft: "5px"}} alt="logo"/>
                <div style={{marginLeft: "auto", marginTop: "27px"}}>
                    <button onClick={() => goToHome()} style={{ width: "70px", height: "35px"}}>Home</button>
                </div>
            </div>
            <div className='userInfo'>
                <h2>{userName}</h2>
                <h4>이메일 : {userEmail}</h4>
                <h4>등록일 : {signUpDate}</h4>
                <br></br>
                <button onClick={() => deleteUser()}>탈퇴하기</button>
            </div>
        </div>
    );
}

export default MyPage;
import axios from 'axios';
import React, { useState, useEffect, Component, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Hls from 'hls.js';

const Files = () => {

    const apiUrl = "http://raspinas.iptime.org:8085/api/v1";
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const userId = localStorage.getItem("userId")
    const id = searchParams.get("id");
    const isMusic = searchParams.get("is_music");
    const isVideo = searchParams.get("is_video");
    const fileUrl = searchParams.get("file_url");
    const changedUrl = fileUrl.replace(/\//g, '@');
    

    const videoRef = useRef(null);
    const imageRef = useRef(null);

    useEffect(() => {
        
        if(isMusic === "true" || isVideo === "true"){
            let hls;

            if(Hls.isSupported()){
                hls = new Hls();
                hls.loadSource(apiUrl + "/streaming-video/" + changedUrl + "/master.m3u8");
                hls.attachMedia(videoRef.current);
            }
        }
        else{
            axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
            axios.get(apiUrl+"/streaming-image?path="+fileUrl, {
                responseType: 'blob'
            })
                .then(response => {
                    const imageUrl = URL.createObjectURL(response.data);
                    imageRef.current.src = imageUrl;
                })
                .catch(error => {
                    if(error.response && error.response.status === 403) {
                        axios.post(apiUrl + "/refresh-token", {"refreshToken" : localStorage.getItem("refreshToken")})
                            .then(response => {
                                localStorage.setItem('accessToken', response.data.accessToken);
                                localStorage.setItem('refreshToken', response.data.refreshToken);
        
                                axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
                                axios.get(apiUrl + "/streaming-image?path="+fileUrl, {
                                    responseType: 'blob'
                                })
                                    .then(response => {
                                        const imageUrl = URL.createObjectURL(response.data);
                                        imageRef.current.src = imageUrl;
                                    })
                                    .catch(error => {
                                        console.error(error);
                                    });
                                    
                            })
                            .catch(error => {
                                console.error(error);
                                navigate("/login");
                            });
                    } else {
                        console.error(error);
                    }
                })
        }
        

    }, []);

    const downloadFile = async () => {

        axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
        try {
            const response = await axios.get(apiUrl+"/files/"+id, {
                responseType: 'blob'
            });

            console.log(response.headers['Content-Disposition']);
      
            // 파일 이름 추출을 위한 Content-Disposition 헤더 분석
            const contentDisposition = response.headers['Content-Disposition'];
            let filename = 'downloaded-file';
            if (contentDisposition) {
                // 정확한 파일 이름 추출 로직
                const filenameRegex = /filename\*=UTF-8''(.+)/;
                const matches = filenameRegex.exec(contentDisposition);
                if (matches != null && matches[1]) { 
                // '+' 문자가 공백으로 인코딩되었을 경우를 위한 처리
                filename = decodeURIComponent(matches[1].replace(/\+/g, ' '));
                }
            }

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();

            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);
            } catch (error) {
            console.error('Download error:', error);
            }
    }
    

    return (
        <div>
            {isMusic === "true" || isVideo === "true" ? (
                <video ref={videoRef} controls style={{ height: "400px" }} />
            ) : (
                <img ref={imageRef} style={{ height: "400px" }}/>
            )}
            <button onClick={downloadFile}>Download</button>
        </div>
        
        
    );
}

export default Files;
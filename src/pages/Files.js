import axios from 'axios';
import React, { useState, useEffect, Component, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Hls from 'hls.js';

const Files = () => {

    const apiUrl = process.env.REACT_APP_API_URL;
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const userId = localStorage.getItem("userId")
    const id = searchParams.get("id");
    const isMusic = searchParams.get("is_music");
    const isVideo = searchParams.get("is_video");
    const fileUrl = searchParams.get("file_url");
    const changedUrl = fileUrl.replace(/\//g, '@');
    const [progress, setProgress] = useState(0);
    

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
                responseType: 'blob',
                onDownloadProgress: (progressEvent) => {
                    const total = progressEvent.total;
                    const current = progressEvent.loaded;
                    const percentage = Math.round((current / total) * 100);
                    setProgress(percentage);
                }
            });

            console.log(response.headers['content-disposition']);
      
            // 파일 이름 추출을 위한 Content-Disposition 헤더 분석
            const contentDisposition = response.headers['content-disposition'];
            const fileName = decodeURI(
                    contentDisposition
                            .match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)[1]
                            .replace(/['"]/g, "")
                            .slice(5)
                    );

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.style.display = "none";
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();


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
            <div>
                <button onClick={downloadFile}>Download</button>
                {progress > 0 && (
                    <div>
                        <p>Download Progress: {progress}%</p>
                        <progress value={progress} max="100">{progress}%</progress>
                    </div>
                )}
            </div>
            
        </div>
        
        
    );
}

export default Files;
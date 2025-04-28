import axios from 'axios';
import React, { useState, useEffect, Component, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import Hls from 'hls.js';
import heic2any from "heic2any";
import loadingImg from "../assets/loadingImg.png";

const Files = () => {

    const apiUrl = process.env.REACT_APP_API_URL;
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const userId = localStorage.getItem("userId")
    const id = searchParams.get("id");
    const [isMusic, setIsMusic] = useState(null);
    const [isVideo, setIsVideo] = useState(null);
    const [fileUrl, setFileUrl] = useState(null);
    const [fileInfo, setFileInfo] = useState("loading..");
    const [changedUrl, setChangedUrl] = useState(null);
    const [progress, setProgress] = useState(0);
    const [loading, setLoading] = useState(false);
    const [img, setImg] = useState(null);
    let { idIndex, idList } = location.state;
    

    const videoRef = useRef(null);

    useEffect(() => {
        axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
        axios.get(apiUrl + "/files/" + id)
            .then(response => {
                setFileInfo(response.data);
                setIsMusic(response.data.streamingMusic);
                setIsVideo(response.data.streamingVideo);
                setFileUrl(response.data.url);
            })
    }, [id]);

    useEffect(() => {
        if(fileUrl){
            setChangedUrl(fileUrl.replace(/\//g, '@'));
        }
    }, [fileUrl]);

    useEffect(() => {
        let imgBlob;
        setLoading(true);

        const loadMedia = async () => {
            if(fileUrl){
                
                if(isMusic === true || isVideo === true){
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
                        .then(async response => {
                            let blob = response.data;

                            try {
                                if(!supportsHeic() && fileUrl.toLowerCase().endsWith("heic")){
                                    blob = await heic2any({
                                        blob,
                                        toType: "image/jpeg",
                                        quality: 0.9,
                                    });
                                }
                                
                                setImg(URL.createObjectURL(blob));
                            } catch (e) {
                                console.warn("HEIC conversion fail : ", e);
                                setImg(URL.createObjectURL(blob));
                            }
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
                                            .then(async response => {
                                                let blob = response.data;

                                                if(!supportsHeic() && fileUrl.toLowerCase().endsWith("heic")){
                                                    blob = await heic2any({
                                                        blob,
                                                        toType: "image/jpeg",
                                                        quality: 0.9,
                                                    });
                                                }
                                                
                                                setImg(URL.createObjectURL(blob));
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
                        .finally(() => setLoading(false))
                }
            }
        }

        loadMedia();
    }, [changedUrl]);

    const downloadFile = async () => {

        axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
        try {
            const response = await axios.get(apiUrl+"/files/"+id+"/download", {
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

    const goToOtherFile = (next) => {

        if(next){
            if(idIndex+1 !== idList.length){
                idIndex += 1;
                navigate('/files?id='+(idList[idIndex]), { state: { idIndex, idList }, replace: true});
            }
        }
        else{
            if(idIndex !== 0){
                idIndex -= 1;
                navigate('/files?id='+(idList[idIndex]), { state: { idIndex, idList }, replace: true});
            }
        }
    }

    function supportsHeic() {
        const ua = navigator.userAgent;
      
        // Safari 주버전 추출
        const safariMajor = (() => {
          const m = ua.match(/Version\/(\d+)\./);
          return m ? Number(m[1]) : 0;
        })();
      
        // macOS 주버전 추출  (Mac OS X 14_*, 15_*, …)
        const macMajor = (() => {
          const m = ua.match(/Mac OS X (\d+)[._]/);
          return m ? Number(m[1]) : 0;
        })();
      
        // iOS·iPadOS 주버전 추출  (iPhone OS 17_*, CPU OS 18_*, …)
        const iosMajor = (() => {
          const m = ua.match(/(?:iPhone OS|CPU OS) (\d+)[._]/);
          return m ? Number(m[1]) : 0;
        })();
      
        // Safari 17 이상 + (macOS 14 이상 또는 iOS 17 이상)
        const supportsMac  = safariMajor >= 17 && macMajor >= 14;
        const supportsIOS  = iosMajor >= 17;          // iOS17부터 Safari17 내장
        return supportsMac || supportsIOS;
      }
    

    return (
        <div>
            {isMusic === true || isVideo === true ? (
                <video ref={videoRef} controls style={{ height: "400px" }} />
            ) : (
                <img
                    src={ loading ? loadingImg : img }
                    style={{ height: "400px"}}
                />
            )}
            <h3>{fileInfo.originalFileName}</h3>
            <div style={{ display: 'flex', alignItems: "center", justifyContent: 'center'}}>
                <button onClick={() => goToOtherFile(false)} style={{ width: "70px", height: "30px"}}>&lt;-</button>
                <button onClick={() => goToOtherFile(true)} style={{ width: "70px", height: "30px"}}>-&gt;</button>
            </div>
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
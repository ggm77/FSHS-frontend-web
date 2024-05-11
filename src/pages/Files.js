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
        }
        

    }, []);
    

    return (
        <div>
            {isMusic === "true" || isVideo === "true" ? (
                <video ref={videoRef} controls style={{ height: "400px" }} />
            ) : (
                <img ref={imageRef} style={{ height: "400px" }}/>
            )}
        </div>
        
        
    );
}

export default Files;
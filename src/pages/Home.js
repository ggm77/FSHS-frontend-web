import axios from 'axios';
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import folderIcon from '../assets/folderIcon.png';

const Home = () => {

    const apiUrl = "http://raspinas.iptime.org:8085/api/v1";
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const userId = localStorage.getItem("userId")
    const [items, setItems] = useState([]);
    const url = searchParams.get("url");
    const parentUrl = url ? (url.substring(0, url.lastIndexOf('/'))) : "";
    const location = useLocation();

    const findDirectory = (data, targetUrl) => {
        if (data.url === targetUrl && data.directory) {
          return data.children;
        }
    
        if (data.children && data.children.length > 0) {
          for (const child of data.children) {
            const found = findDirectory(child, targetUrl);
            if (found) {
              return found;
            }
          }
        }
    
        return null;
    };

    // for Safari
    // window.onpageshow = function(event) {
    //     if (event.persisted) {
    //         window.location.reload();
    //     }
    // };


    
    
    useEffect(() => {
        axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
        axios.get(apiUrl + "/files")
            .then(response => {
                console.log(response.data);
    
                const directory = findDirectory(response.data, url ? url : "/" + userId);
                setItems(Array.isArray(directory) ? directory : [directory].filter(Boolean));
    
            })
            .catch(error => {
                console.error(error);
                if (error.response && error.response.status === 403) {
                    axios.post(apiUrl + "/refresh-token", {"refreshToken" : localStorage.getItem("refreshToken")})
                        .then(response => {
                            localStorage.setItem('accessToken', response.data.accessToken);
                            localStorage.setItem('refreshToken', response.data.refreshToken);
    
                            axios.get(apiUrl + "/files")
                                .then(response => {
                                    console.log(response.data);
                                    setItems(Array.isArray(response.data) ? response.data : [response.data].filter(Boolean));
                                })
                                .catch(error => {
                                    console.error(error);
                                });
                        })
                        .catch(error => {
                            console.error(error);
                            navigate("/login");
                        });
                }
            });
    }, []);


    return (
    <div style={{ marginLeft: "10px"}}>
        <div>
            <h4>{url === null || url === "" || url === "/"+userId? "/" : url.substring(userId.length+1)}</h4>
        </div>
        <div>
            <hr style={{ width: '100%' }} />
            <img src={folderIcon} style={{ width: '30px', height: '30px', marginRight: '10px' }} />
            <a href={'/?url='+parentUrl}>..</a>
            <hr style={{ width: '100%' }} />
        </div>
        {items.map(item => (
            <div key={item.id}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                    <img src={ item.directory ? (
                        folderIcon
                    ) : (
                        apiUrl + "/streaming-thumbnail?path=" + item.url
                    )} style={{ width: '30px', height: '30px', marginRight: '10px' }} />
                    <a  href={item.directory ? '/?url='+item.url : '/files?id='+item.id+'&is_music='+item.streamingMusic+'&is_video='+item.streamingVideo+'&file_url='+item.url}>{item.originalFileName}</a>
                </div>
                <hr style={{ width: '100%', margin: '0' }} />
            </div>
        ))}
    </div>
    );
}

export default Home;
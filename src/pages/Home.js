import axios from 'axios';
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import folderIcon from '../assets/folderIcon.png';
import trashcan from '../assets/trashcan.png';
import pen from '../assets/pen.png';
import fileIcon from '../assets/fileIcon.png';
import logo from '../assets/logo.png';

const Home = () => {

    const apiUrl = process.env.REACT_APP_API_URL;
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const userId = localStorage.getItem("userId")
    const [items, setItems] = useState([]);
    const url = searchParams.get("url");
    const parentUrl = url ? (url.substring(0, url.lastIndexOf('/'))) : "";
    const [file, setFile] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);

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
                            
                            axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
                            axios.get(apiUrl + "/files")
                                .then(response => {
                                    console.log(response.data);

                                    const directory = findDirectory(response.data, url ? url : "/" + userId);
                                    setItems(Array.isArray(directory) ? directory : [directory].filter(Boolean));
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
    }, [url, userId, navigate]);

    const handleFileChange = (event) => {
        setFile(event.target.files[0]);
    }

    const handleUpload = () => {
        if(!file) {
            alert("파일을 선택해주세요.");
            return;
        }

        const formData = new FormData();
        formData.append('files', file);
        formData.append('info', JSON.stringify({
            "path":url === null || url === "" || url === "/"+userId ? "/" : url.substring(userId.length+1)+"/",
            "secrete":false
        }))

        axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
        axios.post(apiUrl+"/files", formData, {
            onUploadProgress: progressEvent => {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                setUploadProgress(percentCompleted);
            }
        })
            .then(response => {
                if(response.status === 201){
                    alert("업로드 성공");
                    setUploadProgress(0);
                    window.location.reload();
                }
            })
            .catch(error => {
                console.error(error);
                if(error.response && error.response.status === 403) {
                    axios.post(apiUrl + "/refresh-token", {"refreshToken" : localStorage.getItem("refreshToken")})
                        .then(response => {
                            localStorage.setItem('accessToken', response.data.accessToken);
                            localStorage.setItem('refreshToken', response.data.refreshToken);
    
                            axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
                            axios.post(apiUrl + "/files", formData, {
                                onUploadProgress: progressEvent => {
                                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                                    setUploadProgress(percentCompleted);
                                }
                            })
                                .then(response => {
                                    if(response.status === 201){
                                        alert("업로드 성공");
                                        setUploadProgress(0);
                                        window.location.reload();
                                    }
                                })
                                .catch(error => {
                                    console.error(error);
                                    alert("업로드 실패");
                                    setUploadProgress(0);
                                });
                                
                        })
                        .catch(error => {
                            console.error(error);
                            navigate("/login");
                        });
                } else {
                    console.error(error);
                    alert("업로드 실패");
                    setUploadProgress(0);
                }
            })

    }

    const deleteFile = (id, isDirectory, originalFileName) => {
        if(window.confirm("정말로 '"+ originalFileName +"'을(를) 삭제하시겠습니까?")){
            axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");

            if(isDirectory){
                axios.delete(apiUrl+"/folder/"+id)
                .then(response => {
                    if(response.status === 204){
                        alert("삭제 완료")
                        window.location.reload();
                    }
                })
                .catch(error => {

                    if(error.response && error.response.status === 403) {
                        axios.post(apiUrl + "/refresh-token", {"refreshToken" : localStorage.getItem("refreshToken")})
                            .then(response => {
                                localStorage.setItem('accessToken', response.data.accessToken);
                                localStorage.setItem('refreshToken', response.data.refreshToken);
        
                                axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
                                axios.delete(apiUrl + "/folder/" + id)
                                    .then(response => {
                                        if(response.status === 204){
                                            alert("삭제 완료");
                                            window.location.reload();
                                        }
                                    })
                                    .catch(error => {
                                        console.error(error);
                                        alert("삭제 실패");
                                    });
                                    
                            })
                            .catch(error => {
                                console.error(error);
                                navigate("/login");
                            });
                    } else {
                        console.error(error);
                        alert("삭제 실패");
                    }

                })
            } else{
                axios.delete(apiUrl+"/files/"+id)
                    .then(response => {
                        if(response.status === 204){
                            alert("삭제 완료")
                            window.location.reload();
                        }
                    })
                    .catch(error => {

                        if(error.response && error.response.status === 403) {
                            axios.post(apiUrl + "/refresh-token", {"refreshToken" : localStorage.getItem("refreshToken")})
                                .then(response => {
                                    localStorage.setItem('accessToken', response.data.accessToken);
                                    localStorage.setItem('refreshToken', response.data.refreshToken);
            
                                    axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
                                    axios.delete(apiUrl + "/files/" + id)
                                        .then(response => {
                                            if(response.status === 204){
                                                alert("삭제 완료");
                                                window.location.reload();
                                            }
                                        })
                                        .catch(error => {
                                            console.error(error);
                                            alert("삭제 실패");
                                        });
                                        
                                })
                                .catch(error => {
                                    console.error(error);
                                    navigate("/login");
                                });
                        } else {
                            console.error(error);
                            alert("삭제 실패");
                        }
                    })
            }
            
        }
    }

    const updateFile = (id, isDirectory, url, fileExtension) => {
        
        if(isDirectory){
            const changedUrl = url === null || url === "" || url === "/"+userId? "/" : url.substring(userId.length+1)+"/"
            const inputValue = prompt("새로운 이름을 입력하세요:")
            const path = changedUrl + inputValue;
            const data = {path};

            if(inputValue === null){
                return ;
            }

            axios.patch(apiUrl+"/folder/"+id, data)
                    .then(response => {
                        if(response.status === 200){
                            alert("수정 완료")
                            window.location.reload();
                        }
                    })
                    .catch(error => {

                        if(error.response && error.response.status === 403) {
                            axios.post(apiUrl + "/refresh-token", {"refreshToken" : localStorage.getItem("refreshToken")})
                                .then(response => {
                                    localStorage.setItem('accessToken', response.data.accessToken);
                                    localStorage.setItem('refreshToken', response.data.refreshToken);
            
                                    axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
                                    axios.patch(apiUrl + "/folder/"+id, data)
                                        .then(response => {
                                            if(response.status === 200){
                                                alert("수정 완료");
                                                window.location.reload();
                                            }
                                        })
                                        .catch(error => {
                                            console.error(error);
                                            alert("수정 실패");
                                        });
                                        
                                })
                                .catch(error => {
                                    console.error(error);
                                    navigate("/login");
                                });
                        } else {
                            console.error(error);
                            alert("수정 실패");
                        }
                    })
        } else{
            const newName = prompt("새로운 이름을 입력하세요:");

            if(newName === null){
                return ;
            }
            if(newName.includes('.')){
                alert("이름에 '.'은 들어갈 수 없습니다.");
                return ;
            }

            const originalFileName = newName+"."+fileExtension;
            const data = {originalFileName};
            axios.patch(apiUrl+"/files/"+id, data)
                    .then(response => {
                        if(response.status === 200){
                            alert("수정 완료")
                            window.location.reload();
                        }
                    })
                    .catch(error => {

                        if(error.response && error.response.status === 403) {
                            axios.post(apiUrl + "/refresh-token", {"refreshToken" : localStorage.getItem("refreshToken")})
                                .then(response => {
                                    localStorage.setItem('accessToken', response.data.accessToken);
                                    localStorage.setItem('refreshToken', response.data.refreshToken);
            
                                    axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
                                    axios.patch(apiUrl + "/files/"+id, data)
                                        .then(response => {
                                            if(response.status === 200){
                                                alert("수정 완료");
                                                window.location.reload();
                                            }
                                        })
                                        .catch(error => {
                                            console.error(error);
                                            alert("수정 실패");
                                        });
                                        
                                })
                                .catch(error => {
                                    console.error(error);
                                    navigate("/login");
                                });
                        }else{
                            console.error(error);
                            alert("수정 실패");
                        }
                    })
        }
    }

    const createFolder = (url) => {
        const path = (url === null || url === "" || url === "/"+userId? "/" : url.substring(userId.length+1)+"/") + prompt("새로운 이름을 입력하세요:");
        const data = {path};

        axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
        axios.post(apiUrl+"/folder", data)
            .then(response => {
                if(response.status === 201){
                    alert("폴더 생성 성공");
                    window.location.reload();
                }
            })
            .catch(error => {
                console.log("1");
                if(error.response && error.response.status === 403) {
                    axios.post(apiUrl + "/refresh-token", {"refreshToken" : localStorage.getItem("refreshToken")})
                        .then(response => {
                            console.log("asdf")
                            localStorage.setItem('accessToken', response.data.accessToken);
                            localStorage.setItem('refreshToken', response.data.refreshToken);
    
                            axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
                            axios.post(apiUrl + "/folder", data)
                                .then(response => {
                                    if(response.status === 201){
                                        alert("폴더 생성 성공");
                                        window.location.reload();
                                    }
                                })
                                .catch(error => {
                                    console.error(error);
                                    alert("폴더 생성 실패");
                                });
                                
                        })
                        .catch(error => {
                            console.error(error);
                            navigate("/login");
                        });
                } else {
                    console.error(error);
                    alert("폴더 생성 실패");
                }
            })
    }

    return (
    <div style={{ marginLeft: "10px"}}>
        <div style={{ display: "flex" }}>
            <img src={logo} style={{height: "35px", marginTop: "27px", marginLeft: "5px"}} alt="logo"/>
            <div style={{ marginLeft: "auto", marginTop: "27px"}}>
                <input type="file" onChange={handleFileChange} style={{ width: "230px", height: "35px"}}/>
                <button onClick={handleUpload} style={{ width: "70px", height: "35px"}}>Upload File</button>
                <button onClick={() => createFolder(url)} style={{ width: "70px", height: "35px"}}>New Folder</button>
            </div>
        </div>
        <p style={{fontSize: "23px"}}>{url === null || url === "" || url === "/"+userId? "/" : url.substring(userId.length+1)}</p>
        {uploadProgress > 0 && (
            <div style={{ marginTop: '10px' }}>
                <div style={{ height: '20px', width: '100%', backgroundColor: '#e0e0df', borderRadius: '2px' }}>
                    <div style={{
                        height: '100%',
                        width: `${uploadProgress}%`,
                        backgroundColor: '#3b5998',
                        borderRadius: '2px',
                        textAlign: 'center',
                        color: 'white'
                    }}>
                        {uploadProgress}%
                    </div>
                </div>
            </div>
        )}
        <div>
            <hr style={{ width: '100%' }} />
            <img src={folderIcon} style={{ width: '30px', height: '30px', marginRight: '10px' }} alt="folder icon"/>
            <a href={'/?url='+parentUrl}>..</a>
            <hr style={{ width: '100%' }} />
        </div>
        {items.map(item => (
            <div key={item.id}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px', marginTop: "5px" }}>
                    <img src={ item.directory ? (
                        folderIcon
                    ) : (
                        item.hasThumbnail ? (
                            apiUrl + "/streaming-thumbnail?path=" + item.url
                        ) : (
                            fileIcon
                        )
                        
                    )} style={{ width: '30px', height: '30px', objectFit: "contain", marginRight: '10px' }} alt="item icon"/>
                    <a href={item.directory ? '/?url='+item.url : '/files?id='+item.id+'&is_music='+item.streamingMusic+'&is_video='+item.streamingVideo+'&file_url='+item.url}>{item.originalFileName}</a>
                    <div style={{ marginLeft: "auto"}}>
                        <img src={pen} onClick={() => updateFile(item.id, item.directory, url, item.fileExtension)} style={{ height: "30px", marginRight: "10px" }} alt="edit icon"/>
                        <img src={trashcan} onClick={() => deleteFile(item.id, item.directory, item.originalFileName)} style={{ height: "30px", marginRight: "10px" }} alt="delete icon"/>
                    </div>        
                </div>
                <hr style={{ width: '100%', margin: '0' }} />
            </div>
        ))}
    </div>
    );
}

export default Home;

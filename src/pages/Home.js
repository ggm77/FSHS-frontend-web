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
    const [id, setId] = useState(searchParams.get("id"));
    const [parentId, setParentId] = useState(0);
    const [file, setFile] = useState([]);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [numberOfFiles, setNumberOfFiles] = useState(0);
    const [numberOfFolders, setNumberOfFolders] = useState(0);
    const [idList, setIdList] = useState([]);
    const [scrollPosition, setScrollPosition] = useState(0);
    const [finish, setFinish] = useState(false);
    const [isDelayOver, setIsDelayOver] = useState(false);

    useEffect(() => {
        if(searchParams.get("id")){
            setId(searchParams.get("id"));
        }
        else{
            setId(userId);
        }
    }, [searchParams.get("id")])

    useEffect(() => {
        axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
        axios.get(id ? apiUrl + "/files/" + id : apiUrl + "/files/" + userId)
            .then(response => {
                console.log(response.data);
    
                const data = response.data.children;
                

                const folderData = data.filter(data => data.directory).sort((a, b) => a.originalFileName.localeCompare(b.originalFileName));
                const fileData = data.filter(data => !data.directory).sort((a, b) => a.originalFileName.localeCompare(b.originalFileName));

                setParentId(response.data.parentId);

                setNumberOfFiles(fileData.length);
                setNumberOfFolders(folderData.length);

                setItems([...folderData, ...fileData]);
                setFinish(true);
            })
            .catch(error => {
                console.error(error);
                if (error.response && error.response.status === 403) {
                    axios.post(apiUrl + "/refresh-token", {"refreshToken" : localStorage.getItem("refreshToken")})
                        .then(response => {
                            localStorage.setItem('accessToken', response.data.accessToken);
                            localStorage.setItem('refreshToken', response.data.refreshToken);
                            
                            axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
                            axios.get(apiUrl + "/files/" + id)
                                .then(response => {
                                    console.log(response.data);
    
                                    const data = response.data.children;
                                    

                                    const folderData = data.filter(data => data.directory).sort((a, b) => a.originalFileName.localeCompare(b.originalFileName));
                                    const fileData = data.filter(data => !data.directory).sort((a, b) => a.originalFileName.localeCompare(b.originalFileName));

                                    setNumberOfFiles(fileData.length);
                                    setNumberOfFolders(folderData.length);

                                    setItems([...folderData, ...fileData]);
                                    setFinish(true);
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
    }, [id, userId, navigate]);

    useEffect(() => {
        const delay = setTimeout(() => {
          setIsDelayOver(true);
        }, 3000); // 3초 동안 지연
    
        return () => clearTimeout(delay); // 컴포넌트가 언마운트될 때 타이머 정리
      }, []);

    useEffect(() => {
        const list = items.map(item => item.id);
        setIdList(list);
    }, [items])

    useEffect(() => {
        // 스크롤 위치를 로컬 스토리지에 저장
        if (finish && isDelayOver) {
          localStorage.setItem('scrollPosition', scrollPosition);
        }
      }, [scrollPosition, finish]);

    
    useEffect(() => {
        // 저장된 스크롤 위치로 이동
        if(finish){
            const savedScrollPosition = localStorage.getItem('scrollPosition');
            if (savedScrollPosition) {
                window.scrollTo(0, parseInt(savedScrollPosition, 10));
            }
        }
    }, [finish]);

    useEffect(() => {
        if (finish) {
          window.addEventListener('scroll', handleScroll);
        }
    
        // 컴포넌트가 언마운트되거나 작업 완료 상태가 변경될 때 스크롤 이벤트 리스너 제거
        return () => {
          window.removeEventListener('scroll', handleScroll);
        };
      }, [finish]);

    const handleFileChange = (event) => {
        setFile(event.target.files);
    }

    const handleUpload = () => {
        if(!file) {
            alert("파일을 선택해주세요.");
            return;
        }

        const formData = new FormData();
        for (let f of file) {
            formData.append('files', f);
        }
        formData.append('info', JSON.stringify({
            "secrete":false
        }))

        axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
        axios.post(apiUrl+"/files/" + id, formData, {
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
                            axios.post(apiUrl + "/files/" + id, formData, {
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

    const deleteFile = (fileId, isDirectory, originalFileName) => {
        if(window.confirm("정말로 '"+ originalFileName +"'을(를) 삭제하시겠습니까?")){
            axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");

            if(isDirectory){
                axios.delete(apiUrl+"/folder/"+fileId)
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
                                axios.delete(apiUrl + "/folder/" + fileId)
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
                axios.delete(apiUrl+"/files/"+fileId)
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
                                    axios.delete(apiUrl + "/files/" + fileId)
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

    const updateFile = (fileId, isDirectory) => {
        
        if(isDirectory){
            const folderName = prompt("새로운 이름을 입력하세요:")
            const data = {folderName};

            if(folderName === null){
                return ;
            }

            axios.patch(apiUrl+"/folder/"+fileId, data)
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
                                    axios.patch(apiUrl + "/folder/"+fileId, data)
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
            const newFileName = prompt("새로운 이름을 입력하세요:");

            if(newFileName === null){
                return ;
            }
            if(newFileName.includes('.')){
                alert("이름에 '.'은 들어갈 수 없습니다.");
                return ;
            }

            const data = {newFileName};
            axios.patch(apiUrl+"/files/"+fileId, data)
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
                                    axios.patch(apiUrl + "/files/"+fileId, data)
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

    const createFolder = () => {
        const folderName = prompt("새로운 이름을 입력하세요:");
        const data = {folderName};

        axios.defaults.headers.common["Authorization"] = 'Bearer ' + localStorage.getItem("accessToken");
        axios.post(apiUrl+"/folder/" + id, data)
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
                            axios.post(apiUrl + "/folder/" + id, data)
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

    const goToFile = (item, idIndex) => {
        if(item.directory){
            navigate('/?id='+item.id);
        }
        else{
            navigate('/files?id='+item.id, { state: { idIndex, idList }})
        }
    }

    const goToPreviousFolder = () => {
        navigate('/?id='+parentId);
    }

    const handleScroll = () => {
        setScrollPosition(window.scrollY);
      };

    const goToMyPage = () => {
        navigate('/mypage');
    }

    return (
    <div style={{ marginLeft: "10px"}}>
        <div style={{ display: "flex" }}>
            <img src={logo} style={{height: "35px", marginTop: "27px", marginLeft: "5px"}} alt="logo"/>
            <div style={{ marginLeft: "auto", marginTop: "27px"}}>
                <input type="file" multiple onChange={handleFileChange} style={{ width: "230px", height: "35px"}}/>
                <button onClick={handleUpload} style={{ width: "70px", height: "35px"}}>Upload</button>
                <button onClick={() => createFolder()} style={{ width: "78px", height: "35px"}}>NewFolder</button>
                <button onClick={() => goToMyPage()} style={{ width: "70px", height: "35px"}}>MyPage</button>
            </div>
        </div>
        <h3>Selected Files:</h3>
        <ul>
          {Array.from(file).map((f, index) => (
            <li key={index}>{f.name}</li>
          ))}
        </ul>
        {/* <p style={{fontSize: "23px"}}>{url === null || url === "" || url === "/"+userId? "/" : url.substring(userId.length+1)}</p> */}
        <div style={{ display: "flex"}}>
            <p>{numberOfFolders} folders, {numberOfFiles} files</p>
        </div>
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
            <div style={{ display: 'flex', cursor: "pointer"}} onClick={goToPreviousFolder}>
                <img src={folderIcon} style={{ width: '40px', height: '40px', marginRight: '10px' }} alt="folder icon"/>
                <p style={{ marginBottom: '0'}}>..</p>
            </div>
            <hr style={{ width: '100%' }} />
        </div>
        {items.map((item, index) => (
            <div key={item.id}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '5px', marginTop: "5px" }}>
                    <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => goToFile(item, index)}>
                        { item.directory ? (
                            <img src={folderIcon} style={{ width: '40px', height: '40px', objectFit: "contain", marginRight: '10px' }} alt="item icon"/>
                        ) : (
                            <img src={item.hasThumbnail ? (
                                apiUrl + "/streaming-thumbnail?path=" + item.url
                            ) : (
                                fileIcon
                            )} style={{ width: '40px', height: '40px', objectFit: "cover", marginRight: '10px' }} alt="item icon"/>
                        )}
                        <p>{item.originalFileName}</p>
                    </div>
                    <div style={{ marginLeft: "auto"}}>
                        <img src={pen} onClick={() => updateFile(item.id, item.directory)} style={{ height: "30px", marginRight: "10px", cursor: 'pointer' }} alt="edit icon"/>
                        <img src={trashcan} onClick={() => deleteFile(item.id, item.directory, item.originalFileName)} style={{ height: "30px", marginRight: "10px", cursor: 'pointer' }} alt="delete icon"/>
                    </div>        
                </div>
                <hr style={{ width: '100%', margin: '0' }} />
            </div>
        ))}
    </div>
    );
}

export default Home;

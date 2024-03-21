import axios from 'axios';
import React, { useState, useEffect } from 'react';

const Home = () => {

    const apiUrl = "http://raspinas.iptime.org:8080/api/v1"
    const userId = localStorage.getItem("userId")
    const [user, setUser] = useState(null);

    useEffect(() => {

        axios.defaults.headers.common[
            "Authorization"
        ] = 'Bearer ' + localStorage.getItem("accessToken");

        axios.get(apiUrl + "/users/" + userId)
            .then(response => {
                console.log(response.data);

            })
            .catch(error => {
                console.error(error);
            });

        
    }, [])

    return (
    <div>
       <h1>메인</h1>
    </div>
    );
}

export default Home;
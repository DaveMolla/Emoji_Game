import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './AuthForm.module.css';


function Register() {
    const [phoneNumber, setPhoneNumber] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();
    const handleSubmit = async (event) => {
        event.preventDefault();

        try {
            const response = await fetch('http://localhost:3002/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ phone_number: phoneNumber, password }),
            });

            console.log('so far so good');


            if (response.ok) {
                console.log('Registration successful');
                navigate('/game');
            } else {
                console.log('Registration failed', response.status);
            }
        } catch (error) {
            console.error('There was an error registering:', error);
        }
    };

    return (
        <div className={styles.formContainer}>
            <h2 className={styles.formTitle}>Register</h2>
            <form onSubmit={handleSubmit}>
                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Phone Number:</label>
                    <input
                        className={styles.formInput}
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                    />
                </div>
                <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Password:</label>
                    <input
                        className={styles.formInput}
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </div>
                <button className={styles.submitButton} type="submit">Register</button>
            </form>
        </div>
    );

}

export default Register;

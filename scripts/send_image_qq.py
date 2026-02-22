# -*- coding: utf-8 -*-
"""
发送图片到 QQ Bot 用户
"""
import os
import sys
import requests

# 配置
APP_ID = "102862558"
APP_SECRET = "W4dCmMxZBoR5jO3jP6oWFyiaTMGA51xu"
SANDBOX = True

BASE_URL = "https://sandbox.api.sgroup.qq.com" if SANDBOX else "https://api.sgroup.qq.com"


def get_access_token():
    """获取 Access Token"""
    url = "https://bots.qq.com/app/getAppAccessToken"
    response = requests.post(url, json={
        "appId": APP_ID,
        "clientSecret": APP_SECRET
    })
    data = response.json()
    return data.get("access_token")


def upload_image(token, file_path):
    """上传图片"""
    url = f"{BASE_URL}/v2/files"

    with open(file_path, 'rb') as f:
        file_data = f.read()

    ext = os.path.splitext(file_path)[1].lower().lstrip('.')

    # 构建 multipart
    boundary = f"----boundary{os.urandom(8).hex()}"
    body = b""
    body += f"--{boundary}\r\n".encode()
    body += f'Content-Disposition: form-data; name="file_type"\r\n\r\n1\r\n'.encode()  # 1=图片
    body += f"--{boundary}\r\n".encode()
    body += f'Content-Disposition: form-data; name="file_type_data"\r\n\r\n{ext}\r\n'.encode()
    body += f"--{boundary}\r\n".encode()
    body += f'Content-Disposition: form-data; name="file"; filename="image.{ext}"\r\n'.encode()
    body += f"Content-Type: image/jpeg\r\n\r\n".encode()
    body += file_data
    body += f"\r\n--{boundary}--\r\n".encode()

    response = requests.post(
        url,
        headers={
            "Authorization": f"QQBot {token}",
            "X-Union-Appid": APP_ID,
            "Content-Type": f"multipart/form-data; boundary={boundary}"
        },
        data=body
    )

    data = response.json()
    print(f"Upload response: {data}")
    return data.get("file_info")


def send_image_message(token, openid, file_info):
    """发送图片消息"""
    url = f"{BASE_URL}/v2/users/{openid}/messages"

    body = {
        "msg_type": 7,  # 富媒体
        "media": [{
            "type": "image",
            "content": file_info
        }]
    }

    response = requests.post(
        url,
        headers={
            "Authorization": f"QQBot {token}",
            "X-Union-Appid": APP_ID,
            "Content-Type": "application/json"
        },
        json=body
    )

    data = response.json()
    print(f"Send response: {data}")
    return data.get("code") == 0


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python send_image_qq.py <image_path> <openid>")
        sys.exit(1)

    file_path = sys.argv[1]
    openid = sys.argv[2]

    print(f"Sending image: {file_path} to {openid}")
    print("-" * 50)

    token = get_access_token()
    if not token:
        print("[ERROR] Failed to get token")
        sys.exit(1)

    print("[OK] Token obtained")

    print("\n[1/2] Uploading image...")
    file_info = upload_image(token, file_path)
    if not file_info:
        print("[ERROR] Upload failed")
        sys.exit(1)

    print(f"[OK] Uploaded: {file_info}")

    print("\n[2/2] Sending message...")
    success = send_image_message(token, openid, file_info)

    if success:
        print("\n[SUCCESS] Image sent!")
    else:
        print("\n[ERROR] Failed to send")

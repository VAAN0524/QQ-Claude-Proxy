# -*- coding: utf-8 -*-
"""
发送文件到 QQ Bot 用户
"""
import os
import sys
import json
import requests

# 添加项目路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# 配置
APP_ID = os.getenv("QQ_BOT_APP_ID", "102862558")
APP_SECRET = os.getenv("QQ_BOT_SECRET", "W4dCmMxZBoR5jO3jP6oWFyiaTMGA51xu")
SANDBOX = os.getenv("QQ_BOT_SANDBOX", "true").lower() == "true"

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


def upload_file(token, file_path):
    """上传文件到 QQ 服务器"""
    url = f"{BASE_URL}/v2/files"

    with open(file_path, 'rb') as f:
        file_data = f.read()

    # 判断文件类型
    ext = os.path.splitext(file_path)[1].lower().lstrip('.')
    file_type_map = {
        'jpg': 1, 'jpeg': 1, 'png': 1, 'gif': 1,
        'mp4': 2,
        'mp3': 3, 'wav': 3,
        'pdf': 4, 'txt': 4, 'json': 4, 'md': 4
    }
    file_type = file_type_map.get(ext, 4)

    # 构建 multipart/form-data
    boundary = f"----boundary{os.urandom(8).hex()}"
    body = b""
    body += f"--{boundary}\r\n".encode()
    body += f'Content-Disposition: form-data; name="file_type"\r\n\r\n{file_type}\r\n'.encode()
    body += f"--{boundary}\r\n".encode()
    body += f'Content-Disposition: form-data; name="file_type_data"\r\n\r\n{ext}\r\n'.encode()
    body += f"--{boundary}\r\n".encode()
    body += f'Content-Disposition: form-data; name="file"; filename="{os.path.basename(file_path)}"\r\n'.encode()
    body += f"Content-Type: application/octet-stream\r\n\r\n".encode()
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
    if "file_info" in data:
        print(f"[OK] File uploaded: {data['file_info']}")
        return data["file_info"]
    else:
        print(f"[ERROR] Upload failed: {data}")
        return None


def send_file_message(token, openid, file_info, is_group=False):
    """发送文件消息"""
    path = f"/v2/groups/{openid}/messages" if is_group else f"/v2/users/{openid}/messages"
    url = f"{BASE_URL}{path}"

    body = {
        "msg_type": 7,  # 富媒体消息
        "media": [{"file_info": file_info}]
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
    if data.get("code") == 0:
        print(f"[OK] Message sent to {openid}")
        return True
    else:
        print(f"[ERROR] Send failed: {data}")
        return False


def main():
    if len(sys.argv) < 3:
        print("Usage: python send_file_to_qq.py <file_path> <openid> [--group]")
        print("")
        print("Example:")
        print("  python send_file_to_qq.py uploaded_image.jpg 123456ABCDEF")
        print("  python send_file_to_qq.py document.pdf 123456ABCDEF --group")
        sys.exit(1)

    file_path = sys.argv[1]
    openid = sys.argv[2]
    is_group = "--group" in sys.argv

    if not os.path.exists(file_path):
        print(f"[ERROR] File not found: {file_path}")
        sys.exit(1)

    print(f"Sending file: {file_path}")
    print(f"To: {'Group' if is_group else 'User'} {openid}")
    print("-" * 50)

    # 1. 获取 token
    print("[1/3] Getting access token...")
    token = get_access_token()
    if not token:
        print("[ERROR] Failed to get access token")
        sys.exit(1)
    print(f"[OK] Token obtained")

    # 2. 上传文件
    print(f"\n[2/3] Uploading file...")
    file_info = upload_file(token, file_path)
    if not file_info:
        print("[ERROR] Failed to upload file")
        sys.exit(1)

    # 3. 发送消息
    print(f"\n[3/3] Sending message...")
    success = send_file_message(token, openid, file_info, is_group)

    if success:
        print("\n" + "=" * 50)
        print("File sent successfully!")
        print("=" * 50)
    else:
        print("\n[ERROR] Failed to send message")
        sys.exit(1)


if __name__ == "__main__":
    main()

# AF Attendance (Android App)

Air Flow ERP ka Attendance Request form, ek tap mein.

Employee app kholta hai, apni **ERP login ID / password** se ek baar login karta hai. Uske baad har din:

1. App kholo. Form khud bhar jaata hai: Employee, aaj ki From/To Date, Reason = On Duty
2. **✅ Submit Attendance** dabao. App Save karke "Send for Approval" kar deta hai.

Aaj ki request pehle se bani ho to app duplicate nahi banata, seedha bata deta hai.

## Kaise kaam karta hai
App ke andar wahi ERP website chalti hai (WebView), aur ek chhoti script form ko apne aap bharti hai.
Koi API key nahi chahiye. Har employee ka apna login session use hota hai, isliye wahi permissions lagti hain jo website par hain.

## APK build (GitHub Actions)
Repo mein 2 secrets add karo: **Settings → Secrets and variables → Actions → New repository secret**

| Name | Value |
|---|---|
| `KEYSTORE_BASE64` | `keystore-base64.txt` ka poora content |
| `KEYSTORE_PASSWORD` | `keystore-password.txt` ka content |

Ab `main` branch par jab bhi push karoge, APK apne aap build hogi aur Releases mein publish ho jaayegi.

Employees ke liye download link (hamesha latest version deta hai):

```
https://github.com/<username>/<repo>/releases/latest/download/AF-Attendance.apk
```

## Settings (app ke andar ⚙️)
- Employee: khali chhodo to login user ka Employee automatic aata hai
- Reason: On Duty / Work From Home
- Explanation (optional)
- Approval action ka naam (default: Send for Approval)
- "App khulte hi khud submit": ON karne par sirf app kholna hi kaafi hai

## Production URL
`app/src/main/res/values/strings.xml` mein `site_url` badlo, phir push karo.

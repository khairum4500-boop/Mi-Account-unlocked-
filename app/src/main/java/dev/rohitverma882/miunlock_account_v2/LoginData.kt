package dev.rohitverma882.miunlock_account_v2

import android.os.Parcel
import android.os.Parcelable

data class LoginData(
    val passToken: String,
    val userId: String,
    val deviceId: String
) : Parcelable {
    constructor(parcel: Parcel) : this(
        parcel.readString() ?: "",
        parcel.readString() ?: "",
        parcel.readString() ?: ""
    )

    override fun writeToParcel(parcel: Parcel, flags: Int) {
        parcel.writeString(passToken)
        parcel.writeString(userId)
        parcel.writeString(deviceId)
    }

    override fun describeContents(): Int = 0

    companion object CREATOR : Parcelable.Creator<LoginData> {
        override fun createFromParcel(parcel: Parcel): LoginData = LoginData(parcel)
        override fun newArray(size: Int): Array<LoginData?> = arrayOfNulls(size)
    }
}

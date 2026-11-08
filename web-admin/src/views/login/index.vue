<template>
    <div>
        <el-form :model="form" :rules="rules" ref="formRef" label-width="120px">
            <el-form-item label="用户名" prop="username">
                <el-input v-model="form.username" placeholder="请输入用户名"></el-input>
            </el-form-item>
            <el-form-item label="密码" prop="password">
                <el-input v-model="form.password" placeholder="请输入密码"></el-input>
            </el-form-item>
            <el-form-item>
                <el-button type="primary" @click="submitForm">登录</el-button>
            </el-form-item>
            </el-form>
    </div>
</template>

<script setup lang="ts">
import { reactive,ref } from 'vue'
import type { ElForm } from 'element-plus'
import { login, getPublicKey,  } from './api.js'
import { encryptWithPublicKey } from '@/libs/helper.js'
const form = reactive({
    username: '',
    password: ''
})
const rules = reactive({
    username: [
        { required: true, message: '请输入用户名', trigger: 'blur' }
    ],
    password: [
        { required: true, message: '请输入密码', trigger: 'blur' }
    ]
})

const formRef = ref<typeof ElForm>()

const submitForm = async () => {
    const valid = await formRef.value?.validate()
    debugger
    if (valid) {
        const {publicKey} = await getPublicKey()
        const encryptedPassword = await encryptWithPublicKey( publicKey, form.password)
        const params = {
            username: form.username,
            password: encryptedPassword
        }
        console.log("login", params)
        const res = await login(params)
        console.log("login", res.data)
    }
}
</script>

<style scoped>

</style>